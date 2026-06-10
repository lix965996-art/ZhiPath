"""xAPI 兼容 REST API（最小子集）。"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel

from services.xapi import get_lrs

router = APIRouter(prefix="/api/v1/xapi", tags=["xapi"])


class StatementRequest(BaseModel):
    session_id: str
    verb: str
    object_id: str
    object_name: str
    actor_name: str | None = None
    result: dict[str, Any] | None = None
    context: dict[str, Any] | None = None


@router.post("/statements")
async def emit_statement(req: StatementRequest):
    return get_lrs().emit(
        session_id=req.session_id,
        verb=req.verb,
        object_id=req.object_id,
        object_name=req.object_name,
        actor_name=req.actor_name,
        result=req.result,
        context=req.context,
    )


@router.get("/{session_id}/statements")
async def list_statements(session_id: str, limit: int = 50):
    return get_lrs().list_statements(session_id, limit=limit)


@router.get("/{session_id}/export.jsonl")
async def export_jsonl(session_id: str):
    text = get_lrs().export_jsonl(session_id)
    return PlainTextResponse(text, media_type="application/x-ndjson")


@router.get("/resource/{object_id}/avg_duration")
async def resource_avg_duration(object_id: str):
    """聚合所有 session 该资源真实学习时长平均 (秒). 无样本时 avg_seconds=0."""
    return get_lrs().aggregate_resource_duration(object_id)
