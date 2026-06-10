from __future__ import annotations

from typing import Any


class SearchRagManager:
    """Search + RAG pipeline (placeholder for Phase 2).

    Will integrate: web search -> embed -> vector store -> retrieve.
    """

    def __init__(self, config: dict[str, Any] | None = None):
        self.config = config or {}

    def search(self, query: str) -> list[str]:
        """Web search (placeholder)."""
        return []

    def retrieve(self, query: str, k: int = 5) -> list[str]:
        """Vector retrieval (placeholder)."""
        return []

    def invoke(self, query: str) -> list[str]:
        """Full pipeline: search -> embed -> retrieve (placeholder)."""
        return self.retrieve(query)
