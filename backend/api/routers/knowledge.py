from __future__ import annotations

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

from services.rag.pipeline import RAGPipeline

router = APIRouter(prefix="/api/v1/knowledge", tags=["knowledge"])
_rag: RAGPipeline | None = None


def _get_rag() -> RAGPipeline:
    global _rag
    if _rag is None:
        _rag = RAGPipeline()
    return _rag


class AddDocumentRequest(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    content: str = Field(min_length=1)
    tags: list[str] = Field(default_factory=list)


@router.get("/documents")
async def list_documents():
    return await _get_rag().list_documents()


@router.post("/documents")
async def add_document(req: AddDocumentRequest):
    doc = await _get_rag().add_document(
        title=req.title,
        content=req.content,
        tags=req.tags,
        source="api",
    )
    return {
        "id": doc["id"],
        "title": doc["title"],
        "tags": doc["tags"],
        "created_at": doc["created_at"],
    }


@router.get("/search")
async def search_knowledge(q: str = Query(min_length=1), k: int = 5):
    return [
        {
            "document_id": chunk.document_id,
            "title": chunk.title,
            "content": chunk.content,
            "tags": chunk.tags,
            "score": round(chunk.score, 4),
            "retrieval_mode": chunk.retrieval_mode,
        }
        for chunk in await _get_rag().search(q, k=k)
    ]


@router.get("/topology")
async def knowledge_topology():
    """返回知识库拓扑: 文档节点 + 真 embedding 相似度边.

    用 chunk embedding 平均当 doc embedding, 算 cosine 相似度矩阵.
    只保留 sim >= 阈值的边, 避免完全图.
    """
    return await _get_rag().compute_topology()


@router.get("/semantic_map")
async def semantic_map():
    """768d embedding 真 PCA 投影 2D 语义平面. 文档位置 = 模型真实语义距离."""
    return await _get_rag().compute_semantic_map()


@router.get("/project_query")
async def project_query(q: str = Query(min_length=1), k: int = 5):
    """把 query 用同一组 PCA 主成分投影到语义平面, 返回落点 + 真 cosine top-k."""
    return await _get_rag().project_query_semantic(q, k=k)
