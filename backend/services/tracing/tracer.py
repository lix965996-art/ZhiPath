"""轻量级 Span Tracer（OpenTelemetry 兼容语义，但不依赖 OTel SDK）。

设计：
- 每个 Agent / 工具调用作为一个 Span (id, parent_id, name, start, end, attributes)。
- 一个 trace 对应一个 user turn (turn_id 关联 WebSocket session)。
- 暴露 /api/v1/trace/{turn_id} 给前端"工程追溯"页用甘特图展示。
- 也可后续扩展为真 OTel SDK（已对齐字段命名）。
"""
from __future__ import annotations

import contextvars
import logging
import time
import uuid
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import Any, Iterator

logger = logging.getLogger(__name__)


@dataclass
class Span:
    span_id: str
    trace_id: str
    parent_id: str | None
    name: str
    kind: str = "internal"  # internal / agent / llm / tool / db
    start_time: float = field(default_factory=time.time)
    end_time: float | None = None
    attributes: dict[str, Any] = field(default_factory=dict)
    events: list[dict[str, Any]] = field(default_factory=list)
    status: str = "ok"
    error_message: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "span_id": self.span_id,
            "trace_id": self.trace_id,
            "parent_id": self.parent_id,
            "name": self.name,
            "kind": self.kind,
            "start_time": self.start_time,
            "end_time": self.end_time,
            "duration_ms": (
                int((self.end_time - self.start_time) * 1000)
                if self.end_time is not None
                else None
            ),
            "attributes": self.attributes,
            "events": list(self.events),
            "status": self.status,
            "error_message": self.error_message,
        }


class Tracer:
    """简单内存 tracer：保留最近 200 个 trace。"""

    MAX_TRACES = 200

    def __init__(self) -> None:
        self._traces: dict[str, list[Span]] = {}
        self._order: list[str] = []

    def start_trace(self, trace_id: str | None = None) -> str:
        tid = trace_id or uuid.uuid4().hex
        if tid not in self._traces:
            self._traces[tid] = []
            self._order.append(tid)
            self._evict()
        return tid

    def _evict(self) -> None:
        while len(self._order) > self.MAX_TRACES:
            oldest = self._order.pop(0)
            self._traces.pop(oldest, None)

    def add_span(self, trace_id: str, span: Span) -> None:
        bucket = self._traces.setdefault(trace_id, [])
        bucket.append(span)

    def get_trace(self, trace_id: str) -> list[dict[str, Any]]:
        return [s.to_dict() for s in self._traces.get(trace_id, [])]

    def list_traces(self, limit: int = 30) -> list[dict[str, Any]]:
        result = []
        for tid in self._order[-limit:][::-1]:
            spans = self._traces.get(tid, [])
            if not spans:
                continue
            first = min(s.start_time for s in spans)
            last = max((s.end_time or s.start_time) for s in spans)
            result.append({
                "trace_id": tid,
                "span_count": len(spans),
                "start_time": first,
                "end_time": last,
                "duration_ms": int((last - first) * 1000),
                "root_name": spans[0].name,
            })
        return result


_tracer = Tracer()


def get_tracer() -> Tracer:
    return _tracer


# 当前 trace/span 通过 contextvars 传递，跨 async/await 也能正确传播
_current_trace_id: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "lf_trace_id", default=None,
)
_current_parent_id: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "lf_parent_id", default=None,
)


@contextmanager
def trace_scope(trace_id: str) -> Iterator[str]:
    tracer = get_tracer()
    tid = tracer.start_trace(trace_id)
    token = _current_trace_id.set(tid)
    try:
        yield tid
    finally:
        _current_trace_id.reset(token)


@contextmanager
def span(
    name: str,
    kind: str = "internal",
    attributes: dict[str, Any] | None = None,
) -> Iterator[Span]:
    tracer = get_tracer()
    trace_id = _current_trace_id.get()
    if trace_id is None:
        # 没有显式 trace，新开一个
        trace_id = tracer.start_trace()
        trace_token = _current_trace_id.set(trace_id)
    else:
        trace_token = None

    parent_id = _current_parent_id.get()
    s = Span(
        span_id=uuid.uuid4().hex[:12],
        trace_id=trace_id,
        parent_id=parent_id,
        name=name,
        kind=kind,
        attributes=dict(attributes or {}),
    )
    parent_token = _current_parent_id.set(s.span_id)
    try:
        yield s
        s.status = "ok"
    except Exception as exc:
        s.status = "error"
        s.error_message = str(exc)[:300]
        raise
    finally:
        s.end_time = time.time()
        tracer.add_span(trace_id, s)
        _current_parent_id.reset(parent_token)
        if trace_token is not None:
            _current_trace_id.reset(trace_token)


def annotate_event(span_obj: Span, name: str, **attributes: Any) -> None:
    span_obj.events.append({
        "name": name,
        "time": time.time(),
        "attributes": dict(attributes),
    })
