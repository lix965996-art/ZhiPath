"""学习路径相关 API · 当前只有 PathRevision 真记录查询."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Query

from services.path_revision_store import PathRevisionStore

router = APIRouter(prefix="/api/v1/path", tags=["path"])

_store = PathRevisionStore()


@router.get("/{session_id}/revisions")
async def list_revisions(
    session_id: str,
    limit: int = Query(20, ge=1, le=50),
) -> dict[str, Any]:
    """返回该会话的路径重规划真记录列表 (最新在前)."""
    records = await _store.list_for_session(session_id, limit=limit)
    count = await _store.count_for_session(session_id)
    return {
        "session_id": session_id,
        "count": count,
        "revisions": records,
    }
