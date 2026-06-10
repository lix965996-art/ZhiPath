"""Trace 查询路由：把内部 span 暴露给前端"工程追溯"页用甘特图渲染。"""
from __future__ import annotations

from fastapi import APIRouter

from services.tracing import get_tracer

router = APIRouter(prefix="/api/v1/trace", tags=["trace"])


@router.get("")
async def list_traces(limit: int = 30):
    return get_tracer().list_traces(limit=limit)


@router.get("/{trace_id}")
async def get_trace(trace_id: str):
    spans = get_tracer().get_trace(trace_id)
    return {"trace_id": trace_id, "spans": spans}
