from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from typing import AsyncIterator

from .events import StreamEvent, EventType


class StreamBus:
    """Fan-out async event bus for a single turn.

    Producers emit StreamEvents; multiple consumers can subscribe.
    Maintains history so late subscribers catch up.
    """

    def __init__(self) -> None:
        self._subscribers: list[asyncio.Queue[StreamEvent | None]] = []
        self._history: list[StreamEvent] = []
        self._seq: int = 0
        self.is_done: bool = False

    def emit(self, event: StreamEvent) -> None:
        event.seq = self._seq
        self._seq += 1
        self._history.append(event)
        for q in self._subscribers:
            q.put_nowait(event)

    def content(self, text: str, source: str = "", **meta) -> None:
        self.emit(StreamEvent(type=EventType.CONTENT, content=text, source=source, metadata=meta))

    def thinking(self, text: str, **meta) -> None:
        self.emit(StreamEvent(type=EventType.THINKING, content=text, metadata=meta))

    def error(self, message: str, **meta) -> None:
        self.emit(StreamEvent(type=EventType.ERROR, content=message, metadata=meta))

    def result(self, data: str, source: str = "", **meta) -> None:
        self.emit(StreamEvent(type=EventType.RESULT, content=data, source=source, metadata=meta))

    def tool_call(self, agent_name: str, input_summary: str = "", **meta) -> None:
        self.emit(StreamEvent(
            type=EventType.TOOL_CALL,
            content=input_summary,
            source=agent_name,
            metadata=meta,
        ))

    def tool_result(self, agent_name: str, output_summary: str = "", status: str = "success", **meta) -> None:
        self.emit(StreamEvent(
            type=EventType.TOOL_RESULT,
            content=output_summary,
            source=agent_name,
            metadata={**meta, "status": status},
        ))

    def agent_message(
        self,
        from_agent: str,
        to_agent: str,
        payload: dict | str = "",
        label: str = "",
    ) -> None:
        """Agent → Agent 的结构化通信。前端 AgentWorkflowGraph 据此画连线气泡。"""
        self.emit(StreamEvent(
            type=EventType.AGENT_MESSAGE,
            content=label,
            source=from_agent,
            metadata={"to": to_agent, "payload": payload, "label": label},
        ))

    def profile_update(self, dimension: str, value, evidence: str = "", **meta) -> None:
        """画像维度增量更新。"""
        self.emit(StreamEvent(
            type=EventType.PROFILE_UPDATE,
            content=str(value),
            source="LearnerProfileAgent",
            metadata={"dimension": dimension, "evidence": evidence, **meta},
        ))

    def loop_step(self, step: str, status: str = "running", **meta) -> None:
        """Auto-Tutor 闭环单步进度。"""
        self.emit(StreamEvent(
            type=EventType.LOOP_STEP,
            content=step,
            source="AutoTutor",
            metadata={"status": status, **meta},
        ))

    def done(self) -> None:
        self.is_done = True
        self.emit(StreamEvent(type=EventType.DONE))

    @asynccontextmanager
    async def stage(self, name: str):
        self.emit(StreamEvent(type=EventType.STAGE_START, stage=name))
        try:
            yield
        finally:
            self.emit(StreamEvent(type=EventType.STAGE_END, stage=name))

    async def subscribe(self) -> AsyncIterator[StreamEvent]:
        q: asyncio.Queue[StreamEvent | None] = asyncio.Queue()
        self._subscribers.append(q)
        # Replay history
        for event in self._history:
            yield event
        try:
            while True:
                event = await q.get()
                if event is None:
                    break
                yield event
        finally:
            self._subscribers.remove(q)

    def close(self) -> None:
        for q in self._subscribers:
            q.put_nowait(None)
