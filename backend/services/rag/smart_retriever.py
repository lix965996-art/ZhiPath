"""SmartRetriever：在 GraphRAG 前**叠加**一层"多查询变体"。

设计取舍（区别于 DeepTutor 原版）：
1. **不替换 GraphRAG**。ZhiPath 已经做了 KG 1-hop 邻居扩展 = 解决"概念依赖"漏召回；
   SmartRetriever 解决的是另一个正交问题——"同义词/不同表述"漏召回。
   两者顺序叠加：query → 变体 → 各自喂给 GraphRAG → 合并去重 → 按分数排序。
2. **不再做 LLM 聚合**。原 DeepTutor 用 LLM 聚合检索结果造成 +1 次 LLM 调用，
   我们已经有 build_cited_context 在做带编号格式化，不需要二次聚合。
3. **变体生成用 cheap LLM**（ModelRouter chat 路由：iflytek-spark-pro / kimi-k2.5），
   不用 reasoning 大模型，避免拖慢响应。
4. **变体数量 2**（含原 query 共 3 个），平衡召回率和延迟。
"""
from __future__ import annotations

import asyncio
import logging
import re
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from base.model_router import get_model_router
from services.guardrail.citation import CitedKnowledgeContext, build_cited_context
from services.knowledge_graph import KnowledgeGraph
from services.rag.graph_rag import GraphRAG
from services.rag.pipeline import KnowledgeChunk, RAGPipeline

logger = logging.getLogger(__name__)


VARIANT_SYSTEM = (
    "你是 ZhiPath 的检索查询改写助手。"
    "给你一个学生原话，输出 2 条**用词不同但意图相同**的检索 query，"
    "用换行分隔，不要编号、不要解释，每条 5-20 字。"
)


class SmartRetriever:
    """变体生成 → GraphRAG 检索 → 合并去重。"""

    def __init__(self, rag: RAGPipeline, kg: KnowledgeGraph) -> None:
        self.rag = rag
        self.kg = kg
        self.graph_rag = GraphRAG(rag, kg)

    async def generate_variants(self, query: str, n: int = 2) -> list[str]:
        """便宜模型出 n 个 query 变体；失败时降级为空列表（不阻塞主流程）。"""
        if n <= 0 or not query.strip():
            return []
        router = get_model_router()
        llm, _ = router.for_task("chat")  # 用 chat 档便宜模型
        try:
            result = await asyncio.to_thread(
                lambda: llm.invoke([
                    SystemMessage(content=VARIANT_SYSTEM),
                    HumanMessage(content=query),
                ]),
            )
            text = result.content if hasattr(result, "content") else str(result)
            lines = [
                re.sub(r"^[\s\-\d.、。)）]+", "", line).strip()
                for line in str(text).strip().splitlines()
                if line.strip()
            ]
            # 去掉跟原 query 几乎一样的
            seen = {query.strip()}
            cleaned: list[str] = []
            for line in lines:
                if 2 <= len(line) <= 60 and line not in seen:
                    cleaned.append(line)
                    seen.add(line)
            return cleaned[:n]
        except Exception as exc:
            logger.info("Variant generation failed (graceful): %s", exc)
            return []

    async def smart_search(
        self,
        session_id: str,
        query: str,
        k: int = 5,
        n_variants: int = 2,
    ) -> list[KnowledgeChunk]:
        variants = await self.generate_variants(query, n=n_variants)
        all_queries = [query, *variants]

        # 并行：每个 query 走完整 GraphRAG（含 KG 邻居扩展）
        chunks_lists = await asyncio.gather(
            *[self.graph_rag.search(session_id, q, k=k) for q in all_queries],
            return_exceptions=True,
        )

        # 合并去重，权重叠加（多次命中的 chunk 分数加成）
        merged: dict[tuple[str, str], KnowledgeChunk] = {}
        hits: dict[tuple[str, str], int] = {}
        for cl in chunks_lists:
            if isinstance(cl, Exception) or not cl:
                continue
            for c in cl:
                key = (str(c.document_id), c.content[:40])
                hits[key] = hits.get(key, 0) + 1
                if key not in merged:
                    merged[key] = c
                else:
                    # 同一 chunk 多次召回，保留高分版本
                    if c.score > merged[key].score:
                        merged[key] = c

        # 多次命中加成（最多 +50%）
        for key, c in merged.items():
            c.score = c.score * (1 + 0.25 * (hits[key] - 1))

        results = list(merged.values())
        results.sort(key=lambda x: -x.score)
        return results[: k * 2]

    async def build_cited_context(
        self,
        session_id: str,
        query: str,
        k: int = 5,
        max_chars: int = 3000,
        n_variants: int = 2,
    ) -> CitedKnowledgeContext:
        chunks = await self.smart_search(session_id, query, k=k, n_variants=n_variants)
        return build_cited_context(chunks, max_chars=max_chars)
