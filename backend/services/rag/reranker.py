"""RAG Reranker — cross-encoder and LLM-based reranking strategies.

Inserts a reranking stage between retrieval and final result return.
The cross-encoder re-scores (query, passage) pairs for more precise
semantic relevance, significantly improving RAG answer quality.

Usage in RAGPipeline:
    from services.rag.reranker import get_reranker
    reranker = get_reranker()  # reads config.rag.reranker
    ranked = await reranker.rerank(query, candidates, top_k=5)
"""
from __future__ import annotations

import asyncio
import json
import logging
from abc import ABC, abstractmethod
from typing import Any

from config.loader import get_config
from services.rag.pipeline import KnowledgeChunk

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Cross-encoder reranker (sentence-transformers)
# ---------------------------------------------------------------------------

_cross_encoder_model: Any = None


def _get_cross_encoder(model_name: str):
    """Lazy-load CrossEncoder model (singleton)."""
    global _cross_encoder_model
    if _cross_encoder_model is not None:
        return _cross_encoder_model
    try:
        from sentence_transformers import CrossEncoder

        logger.info("Loading cross-encoder reranker model: %s", model_name)
        _cross_encoder_model = CrossEncoder(model_name, max_length=512)
        logger.info("Cross-encoder model loaded successfully")
        return _cross_encoder_model
    except ImportError:
        logger.warning(
            "sentence-transformers not installed; cross-encoder reranker unavailable. "
            "Install with: pip install sentence-transformers"
        )
        return None
    except Exception as exc:
        logger.error("Failed to load cross-encoder model %s: %s", model_name, exc)
        return None


class CrossEncoderReranker:
    """Rerank candidates using a cross-encoder model from sentence-transformers."""

    def __init__(self, model_name: str = "cross-encoder/ms-marco-MiniLM-L-6-v2", max_length: int = 512):
        self.model_name = model_name
        self.max_length = max_length
        self._model: Any = None

    def _ensure_model(self):
        if self._model is None:
            self._model = _get_cross_encoder(self.model_name)

    async def rerank(
        self,
        query: str,
        chunks: list[KnowledgeChunk],
        top_k: int = 5,
    ) -> list[KnowledgeChunk]:
        if not chunks:
            return chunks
        self._ensure_model()
        if self._model is None:
            logger.warning("Cross-encoder model unavailable, skipping reranking")
            return chunks[:top_k]

        pairs = [(query, chunk.content) for chunk in chunks]

        # Run in thread pool to avoid blocking the event loop
        scores = await asyncio.to_thread(self._model.predict, pairs)

        # Sort by score descending
        scored_chunks = list(zip(chunks, scores))
        scored_chunks.sort(key=lambda x: float(x[1]), reverse=True)

        # Update scores and return top_k
        result: list[KnowledgeChunk] = []
        for chunk, score in scored_chunks[:top_k]:
            # Normalize score to [0, 1] range (cross-encoder scores are raw logits)
            normalized_score = 1.0 / (1.0 + float(-score)) if float(score) < 0 else min(float(score) / 10.0, 1.0)
            result.append(
                KnowledgeChunk(
                    document_id=chunk.document_id,
                    title=chunk.title,
                    content=chunk.content,
                    tags=chunk.tags,
                    score=round(normalized_score, 4),
                    retrieval_mode=f"{chunk.retrieval_mode}+rerank",
                    source_path=chunk.source_path,
                    course=chunk.course,
                    type=chunk.type,
                    file_ext=chunk.file_ext,
                )
            )
        logger.debug(
            "Cross-encoder reranked %d candidates → %d results (top score: %.4f)",
            len(chunks), len(result), result[0].score if result else 0,
        )
        return result


# ---------------------------------------------------------------------------
# LLM-based reranker (no extra model download required)
# ---------------------------------------------------------------------------

class LLMReranker:
    """Rerank candidates using LLM relevance scoring.

    Sends each candidate to the LLM with a scoring prompt.
    Falls back gracefully if LLM is unavailable.
    """

    _SCORE_PROMPT = """请评估以下文档片段与用户查询的相关性。

用户查询：{query}

文档片段：
{content}

请仅回复一个 0 到 10 的整数评分（10 = 完全相关，0 = 完全无关）。
只回复数字，不要包含任何其他文字。"""

    def __init__(self):
        self._llm: Any = None

    def _ensure_llm(self):
        if self._llm is not None:
            return
        try:
            from base.llm_factory import LLMFactory

            self._llm = LLMFactory.from_profile(None)
            logger.info("LLM reranker initialized with default profile")
        except Exception as exc:
            logger.warning("LLM reranker initialization failed: %s", exc)

    async def rerank(
        self,
        query: str,
        chunks: list[KnowledgeChunk],
        top_k: int = 5,
    ) -> list[KnowledgeChunk]:
        if not chunks:
            return chunks
        self._ensure_llm()
        if self._llm is None:
            logger.warning("LLM unavailable, skipping reranking")
            return chunks[:top_k]

        scored: list[tuple[KnowledgeChunk, float]] = []

        # Score in parallel (batch of up to 5 concurrent calls)
        semaphore = asyncio.Semaphore(5)

        async def _score_one(chunk: KnowledgeChunk) -> tuple[KnowledgeChunk, float]:
            async with semaphore:
                try:
                    prompt = self._SCORE_PROMPT.format(query=query, content=chunk.content[:1000])
                    from langchain_core.messages import HumanMessage

                    response = await asyncio.wait_for(
                        self._llm.ainvoke([HumanMessage(content=prompt)]),
                        timeout=10,
                    )
                    text = response.content if hasattr(response, "content") else str(response)
                    # Extract number from response
                    score = self._parse_score(text)
                    return (chunk, score)
                except Exception as exc:
                    logger.debug("LLM scoring failed for chunk, using original score: %s", exc)
                    return (chunk, chunk.score)

        results = await asyncio.gather(*[_score_one(c) for c in chunks])
        scored = list(results)
        scored.sort(key=lambda x: x[1], reverse=True)

        result: list[KnowledgeChunk] = []
        for chunk, score in scored[:top_k]:
            result.append(
                KnowledgeChunk(
                    document_id=chunk.document_id,
                    title=chunk.title,
                    content=chunk.content,
                    tags=chunk.tags,
                    score=round(score / 10.0, 4) if score > 1 else round(score, 4),
                    retrieval_mode=f"{chunk.retrieval_mode}+llm_rerank",
                    source_path=chunk.source_path,
                    course=chunk.course,
                    type=chunk.type,
                    file_ext=chunk.file_ext,
                )
            )
        return result

    @staticmethod
    def _parse_score(text: str) -> float:
        """Extract numeric score from LLM response."""
        import re

        text = text.strip()
        # Try to find a number (possibly with decimal)
        match = re.search(r"(\d+(?:\.\d+)?)", text)
        if match:
            score = float(match.group(1))
            return min(max(score, 0.0), 10.0)
        return 0.0


# ---------------------------------------------------------------------------
# Null reranker (passthrough)
# ---------------------------------------------------------------------------

class NullReranker:
    """No-op reranker — returns candidates unchanged."""

    async def rerank(
        self,
        query: str,
        chunks: list[KnowledgeChunk],
        top_k: int = 5,
    ) -> list[KnowledgeChunk]:
        return chunks[:top_k]


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------

_reranker_instance: Any = None


def get_reranker() -> CrossEncoderReranker | LLMReranker | NullReranker:
    """Get the configured reranker instance (singleton)."""
    global _reranker_instance
    if _reranker_instance is not None:
        return _reranker_instance

    config = get_config().rag.reranker
    if not config.enabled:
        logger.info("Reranker disabled by config")
        _reranker_instance = NullReranker()
        return _reranker_instance

    strategy = config.strategy.lower()
    if strategy == "crossencoder":
        _reranker_instance = CrossEncoderReranker(
            model_name=config.model_name,
            max_length=config.max_length,
        )
        logger.info("Using cross-encoder reranker (%s)", config.model_name)
    elif strategy == "llm":
        _reranker_instance = LLMReranker()
        logger.info("Using LLM-based reranker")
    else:
        logger.info("Unknown reranker strategy '%s', using null reranker", strategy)
        _reranker_instance = NullReranker()

    return _reranker_instance
