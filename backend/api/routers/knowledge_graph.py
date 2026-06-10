"""知识图谱 REST API。"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

from services.knowledge_graph import KnowledgeGraph
from services.mastery import MasteryStore

router = APIRouter(prefix="/api/v1/kg", tags=["knowledge-graph"])
kg = KnowledgeGraph()
mastery_store = MasteryStore()


class NodesRequest(BaseModel):
    nodes: list[dict[str, Any]]


class EdgesRequest(BaseModel):
    edges: list[dict[str, Any]]


class IngestRequest(BaseModel):
    nodes: list[dict[str, Any]] = []
    edges: list[dict[str, Any]] = []


@router.get("/{session_id}")
async def get_graph(session_id: str):
    return await kg.get(session_id)


@router.post("/{session_id}/nodes")
async def add_nodes(session_id: str, req: NodesRequest):
    return await kg.upsert_nodes(session_id, req.nodes)


@router.post("/{session_id}/edges")
async def add_edges(session_id: str, req: EdgesRequest):
    return await kg.add_edges(session_id, req.edges)


@router.post("/{session_id}/ingest")
async def ingest(session_id: str, req: IngestRequest):
    if req.nodes:
        await kg.upsert_nodes(session_id, req.nodes)
    if req.edges:
        await kg.add_edges(session_id, req.edges)
    return await kg.get(session_id)


@router.get("/{session_id}/topo_order")
async def topo_order(session_id: str):
    order = await kg.topo_sort(session_id)
    return {"order": order, "count": len(order)}


@router.get("/{session_id}/suggest")
async def suggest_next(session_id: str, threshold: float = 0.6, limit: int = 5):
    """根据当前 BKT mastery 推荐下一步学什么。"""
    mastery_snapshot = await mastery_store.get_mastery(session_id)
    mastery_map = {kc["kc_id"]: kc["mastery"] for kc in mastery_snapshot.get("kcs", [])}
    return await kg.suggest_next(
        session_id,
        mastery=mastery_map,
        threshold=threshold,
        limit=limit,
    )


@router.get("/{session_id}/diagnose/{node_id}")
async def diagnose(session_id: str, node_id: str, threshold: float = 0.6):
    mastery_snapshot = await mastery_store.get_mastery(session_id)
    mastery_map = {kc["kc_id"]: kc["mastery"] for kc in mastery_snapshot.get("kcs", [])}
    return await kg.diagnose_gaps(session_id, node_id, mastery_map, threshold)
