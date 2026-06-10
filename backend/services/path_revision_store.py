"""学习路径重规划真实记录.

每次 PathScheduler 跑完一次新路径后, 写一条 revision:
- timestamp / trigger (画像/反馈) / previous_summary / new_summary / reason

文件持久化 (跟 profile/resource_package 一致, 无需 alembic).
"""
from __future__ import annotations

import json
import logging
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).resolve().parents[1] / "data" / "path_revisions"


class PathRevisionStore:
    """每会话维护一份重规划历史 JSON 文件."""

    def __init__(self) -> None:
        DATA_DIR.mkdir(parents=True, exist_ok=True)

    async def append(
        self,
        session_id: str,
        *,
        trigger: str,                 # "profile_update" / "quiz_feedback" / "explicit_request"
        reason: str,                  # 人类可读的触发原因
        previous_summary: str = "",
        new_summary: str = "",
        previous_stage_count: int = 0,
        new_stage_count: int = 0,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        now = datetime.now(timezone.utc).isoformat()
        record = {
            "id": f"rev_{uuid.uuid4().hex[:10]}",
            "session_id": session_id,
            "timestamp": now,
            "trigger": trigger,
            "reason": reason,
            "previous_summary": previous_summary,
            "new_summary": new_summary,
            "previous_stage_count": previous_stage_count,
            "new_stage_count": new_stage_count,
            "metadata": metadata or {},
        }
        history = self._read(session_id)
        history.append(record)
        # 保留最近 50 条
        if len(history) > 50:
            history = history[-50:]
        self._write(session_id, history)
        logger.info("Path revision recorded: %s · %s", session_id, trigger)
        return record

    async def list_for_session(
        self,
        session_id: str,
        limit: int = 20,
    ) -> list[dict[str, Any]]:
        history = self._read(session_id)
        history.sort(key=lambda r: str(r.get("timestamp", "")), reverse=True)
        return history[: max(1, min(limit, 50))]

    async def count_for_session(self, session_id: str) -> int:
        return len(self._read(session_id))

    # ---- 内部 ----
    @staticmethod
    def _path(session_id: str) -> Path:
        safe = re.sub(r"[^a-zA-Z0-9_-]", "", session_id)
        return DATA_DIR / f"{safe}.json"

    def _read(self, session_id: str) -> list[dict[str, Any]]:
        path = self._path(session_id)
        if not path.exists():
            return []
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(data, list):
                return data
        except json.JSONDecodeError:
            logger.warning("Skipping corrupted path revision file: %s", path)
        return []

    def _write(self, session_id: str, history: list[dict[str, Any]]) -> None:
        self._path(session_id).write_text(
            json.dumps(history, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
