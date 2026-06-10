"""GraphRAG：用知识图谱扩展 RAG 检索。

经典 RAG 只看语义相似度，对"知识依赖"无感知。GraphRAG 改进：
1. 用 BM25/向量召回 top-k chunks（base 检索）
2. 把命中 chunks 的标签/标题映射到 KG 节点
3. 对应 KG 节点的 1-hop 邻居也召回（前置 + 后继）
4. 合并去重，按"语义分 + 图距离衰减"重排序

效果：学生问"逻辑回归"时，GraphRAG 同时召回前置"线性回归"和后续"softmax"
的材料，让 LLM 能在更完整的"知识地图"上回答。

文献参考：Microsoft *GraphRAG: Unlocking LLM discovery on narrative private data* (2024)。
"""
from __future__ import annotations

import logging
import re
from typing import Any

from services.knowledge_graph import KnowledgeGraph
from services.rag.pipeline import KnowledgeChunk, RAGPipeline

logger = logging.getLogger(__name__)


class GraphRAG:
    """GraphRAG = 向量召回 + KG 1-hop 邻居扩展。"""

    def __init__(self, rag: RAGPipeline, kg: KnowledgeGraph) -> None:
        self.rag = rag
        self.kg = kg

    async def search(
        self,
        session_id: str,
        query: str,
        k: int = 5,
        hop_decay: float = 0.5,
    ) -> list[KnowledgeChunk]:
        # 1. 基础语义召回
        base = await self.rag.search(query, k=k)
        if not base:
            return base

        # 2. 命中 chunk 的"标题/标签"映射到 KG node
        graph = await self.kg.get(session_id)
        node_by_label = {self._slug(n["label"]): n for n in graph.get("nodes", [])}
        adj_out: dict[str, list[str]] = {}
        adj_in: dict[str, list[str]] = {}
        for e in graph.get("edges", []):
            adj_out.setdefault(e["source"], []).append(e["target"])
            adj_in.setdefault(e["target"], []).append(e["source"])

        matched_nodes: list[str] = []
        for chunk in base:
            tokens = [chunk.title, *chunk.tags]
            for token in tokens:
                key = self._slug(str(token))
                if key in node_by_label and key not in matched_nodes:
                    matched_nodes.append(key)

        # 3. 1-hop 邻居扩展
        neighbor_ids: list[str] = []
        for nid in matched_nodes:
            for nb in adj_out.get(nid, []) + adj_in.get(nid, []):
                if nb not in neighbor_ids and nb not in matched_nodes:
                    neighbor_ids.append(nb)

        # 4. 为每个邻居 node 用 label 二次召回
        extended: list[KnowledgeChunk] = list(base)
        seen_keys = {(c.document_id, c.content[:40]) for c in base}
        for nb_id in neighbor_ids[:k]:
            node = next((n for n in graph["nodes"] if n["id"] == nb_id), None)
            if not node:
                continue
            label = node.get("label", "")
            if not label:
                continue
            extra = await self.rag.search(label, k=2)
            for c in extra:
                key = (c.document_id, c.content[:40])
                if key in seen_keys:
                    continue
                seen_keys.add(key)
                # 衰减分：越远的邻居权重越低
                c.score = c.score * hop_decay
                c.retrieval_mode = "graph_neighbor"
                extended.append(c)

        # 5. 重排序：组合 (semantic score, graph distance)
        extended.sort(key=lambda c: -c.score)
        return extended[: k * 2]

    async def build_cited_context(
        self,
        session_id: str,
        query: str,
        k: int = 5,
        max_chars: int = 3000,
    ):
        from services.guardrail.citation import build_cited_context

        chunks = await self.search(session_id, query, k=k)
        return build_cited_context(chunks, max_chars=max_chars)

    @staticmethod
    def _slug(label: str) -> str:
        raw = (label or "").strip().lower()
        return re.sub(r"[^a-z0-9一-鿿]+", "_", raw)[:64].strip("_")
