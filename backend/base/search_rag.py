"""Web search integration for RAG augmentation.

Provides web search results as supplementary context when the local
knowledge base doesn't cover the user's query. Supports DuckDuckGo
(no API key required) and can be extended to other providers.

Integration:
  - SearchRagManager.search(query)     → raw search result snippets
  - SearchRagManager.retrieve(query, k) → formatted context strings
  - SearchRagManager.invoke(query)      → full search + format pipeline
"""
from __future__ import annotations

import asyncio
import logging
import os
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from config.loader import get_config

logger = logging.getLogger(__name__)


@dataclass
class WebSearchResult:
    """A single web search result."""
    title: str
    url: str
    snippet: str
    source: str = "web"
    score: float = 0.0
    retrieved_at: str = ""

    def to_context(self) -> str:
        return f"### {self.title}\n来源：{self.url}\n{self.snippet}"


class SearchRagManager:
    """Web search + RAG augmentation pipeline.

    Provider is configured via config.rag.search (default: duckduckgo).
    DuckDuckGo requires no API key; other providers may need one.
    """

    def __init__(self, config: dict[str, Any] | None = None):
        self.config = config or {}
        search_cfg = get_config().rag.search
        self._provider = self.config.get("provider", search_cfg.provider)
        self._max_results = self.config.get("max_results", search_cfg.max_results)
        self._api_key_env = self.config.get("api_key_env", search_cfg.api_key_env)
        logger.info(
            "SearchRagManager initialized (provider=%s, max_results=%d)",
            self._provider, self._max_results,
        )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def search(self, query: str) -> list[WebSearchResult]:
        """Execute web search and return raw results."""
        if self._provider == "duckduckgo":
            return await self._search_duckduckgo(query)
        if self._provider == "bing":
            return await self._search_bing(query)
        if self._provider == "none":
            return []
        # Default: try DuckDuckGo
        return await self._search_duckduckgo(query)

    async def retrieve(self, query: str, k: int = 5) -> list[WebSearchResult]:
        """Search and return top-k formatted results."""
        results = await self.search(query)
        return results[:k]

    async def invoke(self, query: str) -> str:
        """Full pipeline: search → format → return concatenated context."""
        results = await self.retrieve(query)
        if not results:
            return ""
        return "\n\n".join(r.to_context() for r in results)

    # ------------------------------------------------------------------
    # DuckDuckGo implementation (no API key needed)
    # ------------------------------------------------------------------

    async def _search_duckduckgo(self, query: str) -> list[WebSearchResult]:
        """Search DuckDuckGo via duckduckgo-search library."""
        try:
            from duckduckgo_search import DDGS

            def _sync_search() -> list[dict[str, str]]:
                with DDGS() as ddgs:
                    return list(ddgs.text(query, max_results=self._max_results))

            raw_results = await asyncio.to_thread(_sync_search)
            now = datetime.now(timezone.utc).isoformat()
            results: list[WebSearchResult] = []
            for i, item in enumerate(raw_results):
                results.append(
                    WebSearchResult(
                        title=item.get("title", ""),
                        url=item.get("href", item.get("link", "")),
                        snippet=item.get("body", item.get("snippet", "")),
                        source="duckduckgo",
                        score=1.0 - (i * 0.1),  # simple position-based scoring
                        retrieved_at=now,
                    )
                )
            logger.info("DuckDuckGo returned %d results for: %s", len(results), query[:80])
            return results
        except ImportError:
            logger.warning(
                "duckduckgo-search not installed. Install with: pip install duckduckgo-search"
            )
            return []
        except Exception as exc:
            logger.error("DuckDuckGo search failed for '%s': %s", query[:80], exc)
            return []

    # ------------------------------------------------------------------
    # Bing implementation (requires API key)
    # ------------------------------------------------------------------

    async def _search_bing(self, query: str) -> list[WebSearchResult]:
        """Search via Bing Web Search API (requires BING_SEARCH_API_KEY env var)."""
        api_key = os.getenv(self._api_key_env or "BING_SEARCH_API_KEY", "")
        if not api_key:
            logger.warning("Bing API key not set, skipping web search")
            return []

        try:
            import urllib.request
            import urllib.parse
            import json as _json

            base_url = "https://api.bing.microsoft.com/v7.0/search"
            params = urllib.parse.urlencode({"q": query, "count": self._max_results})
            url = f"{base_url}?{params}"

            def _sync_bing() -> list[WebSearchResult]:
                req = urllib.request.Request(url, headers={"Ocp-Apim-Subscription-Key": api_key})
                with urllib.request.urlopen(req, timeout=10) as resp:
                    data = _json.loads(resp.read().decode("utf-8"))
                now = datetime.now(timezone.utc).isoformat()
                results: list[WebSearchResult] = []
                for i, item in enumerate(data.get("webPages", {}).get("value", [])):
                    results.append(
                        WebSearchResult(
                            title=item.get("name", ""),
                            url=item.get("url", ""),
                            snippet=item.get("snippet", ""),
                            source="bing",
                            score=1.0 - (i * 0.1),
                            retrieved_at=now,
                        )
                    )
                return results

            results = await asyncio.to_thread(_sync_bing)
            logger.info("Bing returned %d results for: %s", len(results), query[:80])
            return results
        except Exception as exc:
            logger.error("Bing search failed for '%s': %s", query[:80], exc)
            return []


# ---------------------------------------------------------------------------
# Singleton accessor
# ---------------------------------------------------------------------------

_instance: SearchRagManager | None = None


def get_search_manager() -> SearchRagManager:
    """Get the global SearchRagManager instance (singleton)."""
    global _instance
    if _instance is None:
        _instance = SearchRagManager()
    return _instance
