"""引用追溯：RAG 检索片段加 [来源 #N] 编号，前端可点击跳转。

工作流：
  RAG.search(query) → KnowledgeChunk[]
    → build_cited_context() 把每一段 chunk 包成「[来源 #N]」编号格式
    → 注入到 LLM system prompt 中，并把 sources list 持久化到资源包
  前端 MessageBubble 渲染时识别 [来源 #N] → 渲染为可点击 chip。

低置信度处理：若 RAG top1 score < CONFIDENCE_THRESHOLD，标记 low_confidence=True，
前端展示"未找到强相关知识源，请谨慎采用"提示，体现"防幻觉"。
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

CONFIDENCE_THRESHOLD = 0.35  # 经验值：cosine 相似度（1 - 距离）


@dataclass
class CitedKnowledgeContext:
    """带引用编号的 RAG 上下文：可直接喂给 LLM，也可 to_dict() 给前端。"""

    text: str = ""
    sources: list[dict[str, Any]] = field(default_factory=list)
    low_confidence: bool = True

    @property
    def has_context(self) -> bool:
        return bool(self.text.strip())

    def to_dict(self) -> dict[str, Any]:
        return {
            "text": self.text,
            "sources": self.sources,
            "low_confidence": self.low_confidence,
        }


def build_cited_context(chunks: list[Any], max_chars: int = 3000) -> CitedKnowledgeContext:
    """把 RAG 返回的 chunk 转成带编号的引用上下文。

    输入是 list[KnowledgeChunk]（duck-typed：要有 title、content、tags、score、document_id 属性）。
    """
    if not chunks:
        return CitedKnowledgeContext()

    parts: list[str] = []
    sources: list[dict[str, Any]] = []
    total = 0
    top_score = 0.0
    for index, chunk in enumerate(chunks, start=1):
        title = getattr(chunk, "title", "") or "未命名片段"
        content = getattr(chunk, "content", "") or ""
        tags = getattr(chunk, "tags", []) or []
        score = float(getattr(chunk, "score", 0.0) or 0.0)
        doc_id = getattr(chunk, "document_id", "")
        retrieval_mode = getattr(chunk, "retrieval_mode", "")
        tag_text = f" 标签：{', '.join(tags)}" if tags else ""
        chunk_text = (
            f"[来源 #{index}] ### {title}{tag_text}\n{content}\n（相似度 {score:.2f}）"
        )
        if total + len(chunk_text) > max_chars:
            break
        parts.append(chunk_text)
        total += len(chunk_text)
        top_score = max(top_score, score)
        sources.append({
            "index": index,
            "title": title,
            "document_id": str(doc_id),
            "tags": list(tags),
            "score": round(score, 3),
            "excerpt": _truncate(content, 160),
            "retrieval_mode": retrieval_mode,
        })

    return CitedKnowledgeContext(
        text="\n\n".join(parts),
        sources=sources,
        low_confidence=top_score < CONFIDENCE_THRESHOLD,
    )


def extract_citation_sources(cited_text: str) -> list[dict[str, Any]]:
    """从已带 [来源 #N] 编号的文本里解出 sources 摘要（兜底，供资源包持久化）。"""
    sources: list[dict[str, Any]] = []
    if not cited_text:
        return sources
    # 段落形如：[来源 #1] ### 标题 标签：...\n正文 \n（相似度 0.42）
    pattern = re.compile(
        r"\[来源 #(\d+)\]\s*###\s*([^\n]+?)\n([\s\S]*?)(?=(?:\n\n\[来源 #\d+\])|\Z)",
        re.M,
    )
    for match in pattern.finditer(cited_text):
        index = int(match.group(1))
        title_line = match.group(2).strip()
        body = match.group(3).strip()
        # 标签可能贴在标题后
        title = title_line.split("标签：")[0].strip()
        sources.append({
            "index": index,
            "title": title,
            "excerpt": _truncate(body, 160),
        })
    return sources


def _truncate(text: str, limit: int) -> str:
    cleaned = re.sub(r"\s+", " ", text).strip()
    if len(cleaned) <= limit:
        return cleaned
    return cleaned[: limit - 1] + "…"
