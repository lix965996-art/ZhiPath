from __future__ import annotations

from typing import Any

from services.rag.pipeline import RAGPipeline


async def search_knowledge(query: str, top_k: int = 5) -> list[dict[str, Any]]:
    """Search the 408 kb-final knowledge base through the existing RAG pipeline."""
    rag = RAGPipeline()
    chunks = await rag.search(query, k=top_k)
    return [
        {
            "content": chunk.content,
            "source_path": chunk.source_path,
            "course": chunk.course,
            "score": round(float(chunk.score or 0.0), 4),
        }
        for chunk in chunks[:top_k]
    ]
