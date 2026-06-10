from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from services.database import get_db
from services.models import MessageModel, SessionModel

logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "sessions"
DEFAULT_TITLE = "新对话"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _safe_title(title: str | None) -> str:
    title = (title or "").strip()
    return title[:80] if title else DEFAULT_TITLE


class SessionStore:
    """Async session store with PostgreSQL first and local JSON fallback.

    The demo should still run when PostgreSQL/asyncpg is not installed. Once the
    database path fails, this instance keeps using the local JSON store.
    """

    def __init__(self) -> None:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        self._db_enabled = True

    async def create_session(self, title: str = DEFAULT_TITLE) -> dict[str, Any]:
        if self._db_enabled:
            try:
                async with get_db() as db:
                    session = SessionModel(title=_safe_title(title))
                    db.add(session)
                    await db.commit()
                    await db.refresh(session)
                    return self._model_to_dict(session, messages=[])
            except Exception as exc:
                self._disable_db(exc)

        session = {
            "id": str(uuid.uuid4()),
            "title": _safe_title(title),
            "created_at": _now_iso(),
            "updated_at": _now_iso(),
            "messages": [],
        }
        self._write_json(session)
        return session

    async def get_session(self, session_id: str) -> dict[str, Any] | None:
        if self._db_enabled:
            try:
                async with get_db() as db:
                    result = await db.execute(
                        select(SessionModel)
                        .options(selectinload(SessionModel.messages))
                        .where(SessionModel.id == session_id)
                    )
                    session = result.scalar_one_or_none()
                    if session is None:
                        return None
                    messages = [
                        {
                            "role": m.role,
                            "content": m.content,
                            "timestamp": m.timestamp.isoformat(),
                        }
                        for m in sorted(session.messages, key=lambda x: x.timestamp)
                    ]
                    return self._model_to_dict(session, messages=messages)
            except Exception as exc:
                self._disable_db(exc)

        return self._read_json(session_id)

    async def list_sessions(self, limit: int = 50) -> list[dict[str, Any]]:
        if self._db_enabled:
            try:
                async with get_db() as db:
                    msg_count = (
                        select(MessageModel.session_id, func.count().label("cnt"))
                        .group_by(MessageModel.session_id)
                        .subquery()
                    )
                    result = await db.execute(
                        select(
                            SessionModel.id,
                            SessionModel.title,
                            SessionModel.created_at,
                            SessionModel.updated_at,
                            func.coalesce(msg_count.c.cnt, 0).label("message_count"),
                        )
                        .outerjoin(msg_count, SessionModel.id == msg_count.c.session_id)
                        .order_by(SessionModel.updated_at.desc())
                        .limit(limit)
                    )
                    return [
                        {
                            "id": row.id,
                            "title": row.title,
                            "created_at": row.created_at.isoformat(),
                            "updated_at": row.updated_at.isoformat(),
                            "message_count": row.message_count,
                        }
                        for row in result.all()
                    ]
            except Exception as exc:
                self._disable_db(exc)

        sessions = []
        for path in DATA_DIR.glob("*.json"):
            session = self._read_json(path.stem)
            if not session:
                continue
            # 兼容老数据：updated_at/created_at 缺失时优雅降级（避免 KeyError 让整页崩）
            created_at = (
                session.get("created_at")
                or session.get("updated_at")
                or ""
            )
            updated_at = (
                session.get("updated_at")
                or session.get("created_at")
                or ""
            )
            sessions.append(
                {
                    "id": session.get("id") or path.stem,
                    "title": session.get("title", "未命名会话"),
                    "created_at": created_at,
                    "updated_at": updated_at,
                    "message_count": len(session.get("messages", [])),
                }
            )
        sessions.sort(key=lambda item: item.get("updated_at") or "", reverse=True)
        return sessions[:limit]

    async def add_message(self, session_id: str, role: str, content: str) -> bool:
        if self._db_enabled:
            try:
                async with get_db() as db:
                    session = await db.get(SessionModel, session_id)
                    if session is None:
                        logger.warning("add_message: session %s not found", session_id)
                        return False
                    now = datetime.now(timezone.utc)
                    msg = MessageModel(session_id=session_id, role=role, content=content, timestamp=now)
                    db.add(msg)
                    session.updated_at = now
                    await db.commit()
                    return True
            except Exception as exc:
                self._disable_db(exc)

        session = self._read_json(session_id)
        if session is None:
            logger.warning("add_message: session %s not found in JSON store", session_id)
            return False
        session.setdefault("messages", []).append(
            {"role": role, "content": content, "timestamp": _now_iso()}
        )
        session["updated_at"] = _now_iso()
        self._write_json(session)
        return True

    async def delete_session(self, session_id: str) -> bool:
        if self._db_enabled:
            try:
                async with get_db() as db:
                    session = await db.get(SessionModel, session_id)
                    if session is None:
                        return False
                    await db.delete(session)
                    await db.commit()
                    return True
            except Exception as exc:
                self._disable_db(exc)

        path = self._path(session_id)
        if not path.exists():
            return False
        path.unlink()
        return True

    def _disable_db(self, exc: Exception) -> None:
        self._db_enabled = False
        logger.warning("Database session store unavailable, using JSON fallback: %s", exc)

    @staticmethod
    def _model_to_dict(session: SessionModel, messages: list[dict[str, Any]]) -> dict[str, Any]:
        return {
            "id": session.id,
            "title": session.title,
            "created_at": session.created_at.isoformat(),
            "updated_at": session.updated_at.isoformat(),
            "messages": messages,
        }

    @staticmethod
    def _path(session_id: str) -> Path:
        return DATA_DIR / f"{session_id}.json"

    def _read_json(self, session_id: str) -> dict[str, Any] | None:
        path = self._path(session_id)
        if not path.exists():
            return None
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            logger.warning("Skipping corrupted session file: %s", path)
            return None

    def _write_json(self, session: dict[str, Any]) -> None:
        self._path(session["id"]).write_text(
            json.dumps(session, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
