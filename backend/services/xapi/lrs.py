"""xAPI 兼容学习记录存储（LRS, Learning Record Store）。

参考 IEEE / ADL xAPI（Tin Can API）1.0.3 规范的核心 Statement 结构：
    actor: { name, mbox / openid / account }
    verb : { id, display }
    object: { id, definition }
    result?: { score, completion, success, duration, response }
    context?: { ... }
    timestamp

ZhiPath 把"用户做题/学习/资源生成"等行为按 xAPI Statement 写入本地 JSONL。
LMS 接入侧可拉走，做跨系统对接（与企业培训系统对齐）。

对接 ADL verbs:
- http://adlnet.gov/expapi/verbs/answered  (答题)
- http://adlnet.gov/expapi/verbs/experienced  (浏览资源)
- http://adlnet.gov/expapi/verbs/passed / failed
- http://adlnet.gov/expapi/verbs/completed
- http://adlnet.gov/expapi/verbs/asked  (提问)
"""
from __future__ import annotations

import json
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "xapi"
DATA_DIR.mkdir(parents=True, exist_ok=True)

VERBS = {
    "answered": "http://adlnet.gov/expapi/verbs/answered",
    "experienced": "http://adlnet.gov/expapi/verbs/experienced",
    "passed": "http://adlnet.gov/expapi/verbs/passed",
    "failed": "http://adlnet.gov/expapi/verbs/failed",
    "completed": "http://adlnet.gov/expapi/verbs/completed",
    "asked": "http://adlnet.gov/expapi/verbs/asked",
    "interacted": "http://adlnet.gov/expapi/verbs/interacted",
}


def _safe(name: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_-]", "", name) or "default"


class LRSStore:
    """xAPI Statement 持久化（按 session JSONL）。"""

    def __init__(self) -> None:
        DATA_DIR.mkdir(parents=True, exist_ok=True)

    def _path(self, session_id: str) -> Path:
        return DATA_DIR / f"{_safe(session_id)}.jsonl"

    def emit(
        self,
        session_id: str,
        verb: str,
        object_id: str,
        object_name: str,
        actor_name: str | None = None,
        result: dict[str, Any] | None = None,
        context: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        verb_iri = VERBS.get(verb, f"http://zhipath.local/verbs/{_safe(verb)}")
        statement = {
            "id": str(uuid.uuid4()),
            "actor": {
                "name": actor_name or f"learner_{session_id[:8]}",
                "account": {
                    "homePage": "https://zhipath.local/",
                    "name": session_id,
                },
                "objectType": "Agent",
            },
            "verb": {
                "id": verb_iri,
                "display": {"zh-CN": verb, "en-US": verb},
            },
            "object": {
                "id": f"https://zhipath.local/{object_id}",
                "definition": {
                    "name": {"zh-CN": object_name, "en-US": object_name},
                    "type": "http://adlnet.gov/expapi/activities/learning-resource",
                },
                "objectType": "Activity",
            },
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        if result is not None:
            statement["result"] = result
        if context is not None:
            statement["context"] = context
        path = self._path(session_id)
        with path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(statement, ensure_ascii=False) + "\n")
        return statement

    def list_statements(self, session_id: str, limit: int = 50) -> list[dict[str, Any]]:
        path = self._path(session_id)
        if not path.exists():
            return []
        items: list[dict[str, Any]] = []
        with path.open(encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    items.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
        return items[-limit:][::-1]

    def export_jsonl(self, session_id: str) -> str:
        path = self._path(session_id)
        if not path.exists():
            return ""
        return path.read_text(encoding="utf-8")

    def aggregate_resource_duration(self, object_id: str) -> dict[str, Any]:
        """跨会话聚合某资源 (例如 mindmap_xxx) 的真实学习时长平均.

        扫描全部 session 的 statements 文件, 找 object.id 匹配的 result.duration (ISO 8601 PT 格式),
        返回 平均秒数 / 样本数 / 最近 5 个 raw record.
        """
        import re as _re
        total_sec = 0
        n = 0
        recent: list[dict[str, Any]] = []
        suffix_match = f"/{object_id}"
        if not DATA_DIR.exists():
            return {"avg_seconds": 0, "samples": 0, "recent": []}
        for path in DATA_DIR.glob("*.jsonl"):
            try:
                sess_id = path.stem  # 文件名 = session_id
                with path.open(encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if not line:
                            continue
                        try:
                            st = json.loads(line)
                        except json.JSONDecodeError:
                            continue
                        obj = st.get("object") or {}
                        oid = str(obj.get("id", ""))
                        if not oid.endswith(suffix_match) and oid != object_id:
                            continue
                        result = st.get("result") or {}
                        dur = result.get("duration")
                        if not isinstance(dur, str):
                            continue
                        m = _re.match(
                            r"^PT(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?$",
                            dur,
                        )
                        if not m:
                            continue
                        h, mn, s = m.groups()
                        seconds = (
                            (float(h) if h else 0) * 3600
                            + (float(mn) if mn else 0) * 60
                            + (float(s) if s else 0)
                        )
                        if seconds <= 0:
                            continue
                        total_sec += seconds
                        n += 1
                        recent.append({
                            "session_id": sess_id,
                            "duration_seconds": seconds,
                            "timestamp": st.get("timestamp"),
                        })
            except Exception:
                continue
        recent = sorted(recent, key=lambda r: str(r.get("timestamp", "")), reverse=True)[:5]
        return {
            "avg_seconds": round(total_sec / n, 1) if n else 0,
            "samples": n,
            "recent": recent,
        }


_store: LRSStore | None = None


def get_lrs() -> LRSStore:
    global _store
    if _store is None:
        _store = LRSStore()
    return _store
