from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.session.store import SessionStore

router = APIRouter(prefix="/api/v1/sessions", tags=["sessions"])
store = SessionStore()


class CreateSessionRequest(BaseModel):
    title: str = "新对话"


@router.get("")
async def list_sessions(limit: int = 50):
    return await store.list_sessions(limit)


@router.post("")
async def create_session(req: CreateSessionRequest):
    return await store.create_session(req.title)


@router.get("/{session_id}")
async def get_session(session_id: str):
    session = await store.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.delete("/{session_id}")
async def delete_session(session_id: str):
    if not await store.delete_session(session_id):
        raise HTTPException(status_code=404, detail="Session not found")
    return {"ok": True}
