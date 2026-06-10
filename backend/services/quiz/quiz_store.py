from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "quizzes"


class QuizStore:
    """Persist the latest quiz JSON per session so the frontend can fetch it for interactive rendering."""

    def __init__(self) -> None:
        DATA_DIR.mkdir(parents=True, exist_ok=True)

    async def save_quiz(self, session_id: str, quiz_data: dict[str, Any]) -> None:
        record = {
            "session_id": session_id,
            "quiz": quiz_data,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        path = self._path(session_id)
        path.write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")
        logger.info("Saved quiz for session %s", session_id)

    async def get_latest_quiz(self, session_id: str) -> dict[str, Any] | None:
        path = self._path(session_id)
        if not path.exists():
            return None
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            return data.get("quiz")
        except (json.JSONDecodeError, KeyError):
            logger.warning("Skipping corrupted quiz file: %s", path)
            return None

    @staticmethod
    def _path(session_id: str) -> Path:
        return DATA_DIR / f"{session_id}.json"
