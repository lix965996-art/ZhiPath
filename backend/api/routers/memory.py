from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from services.memory.service import MemoryService

router = APIRouter(prefix="/api/v1/memory", tags=["memory"])
memory_service = MemoryService()


class WriteMemoryRequest(BaseModel):
    session_id: str
    content: str


@router.get("/{session_id}")
async def get_memory(session_id: str):
    return {
        "summary": await memory_service.read_summary(session_id),
        "profile": await memory_service.read_profile(session_id),
    }


@router.put("/summary")
async def write_summary(req: WriteMemoryRequest):
    await memory_service.write_summary(req.session_id, req.content)
    return {"ok": True}


@router.put("/profile")
async def write_profile(req: WriteMemoryRequest):
    await memory_service.write_profile(req.session_id, req.content)
    return {"ok": True}
