from __future__ import annotations

import json
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "memory"


class MemoryService:
    """Small local memory store used by the demo/runtime path."""

    def __init__(self) -> None:
        DATA_DIR.mkdir(parents=True, exist_ok=True)

    async def read_summary(self, session_id: str) -> str:
        return self._read(session_id).get("summary", "")

    async def read_profile(self, session_id: str) -> str:
        return self._read(session_id).get("profile_md", "")

    async def build_memory_context(self, session_id: str, max_chars: int = 4000) -> str:
        data = self._read(session_id)
        parts: list[str] = []
        if data.get("summary"):
            parts.append(f"## 学习摘要\n{data['summary'][: max_chars // 2]}")
        if data.get("profile_md"):
            parts.append(f"## 手动学习者画像\n{data['profile_md'][: max_chars // 2]}")
        return "\n\n".join(parts)

    async def write_summary(self, session_id: str, content: str) -> None:
        data = self._read(session_id)
        data["summary"] = content
        self._write(session_id, data)

    async def write_profile(self, session_id: str, content: str) -> None:
        data = self._read(session_id)
        data["profile_md"] = content
        self._write(session_id, data)

    def _path(self, session_id: str) -> Path:
        return DATA_DIR / f"{session_id}.json"

    def _read(self, session_id: str) -> dict[str, str]:
        path = self._path(session_id)
        if not path.exists():
            return {"summary": "", "profile_md": ""}
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            logger.warning("Skipping corrupted memory file: %s", path)
            return {"summary": "", "profile_md": ""}
        return {
            "summary": str(data.get("summary", "")),
            "profile_md": str(data.get("profile_md", "")),
        }

    def _write(self, session_id: str, data: dict[str, str]) -> None:
        self._path(session_id).write_text(
            json.dumps(data, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
