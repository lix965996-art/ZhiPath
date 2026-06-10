#!/usr/bin/env python3
"""
ingest_pdf.py — 把 PDF 文件批量导入 ZhiPath 知识库。

用法:
    # 导入单个 PDF
    python scripts/ingest_pdf.py data/knowledge/cs404/数据结构/线性表.pdf

    # 导入整个目录下所有 PDF（递归）
    python scripts/ingest_pdf.py data/knowledge/cs404/数据结构/

    # 指定科目标签
    python scripts/ingest_pdf.py data/knowledge/cs404/数据结构/ --subject 数据结构

原理:
    1. pdfplumber 提取每页文本
    2. 按章节标题（# 或 ## 或正则匹配的"第X章"）分块
    3. 每个分块调用 RAGPipeline.add_document() 入库（含向量化）
"""

import argparse
import asyncio
import os
import re
import sys
from pathlib import Path

# 确保项目根目录在 path 上
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

import pdfplumber
from services.rag.pipeline import RAGPipeline


# ── 文本提取 ──

def extract_text_from_pdf(pdf_path: str) -> str:
    """用 pdfplumber 逐页提取文本，过滤空页。"""
    pages = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            text = page.extract_text()
            if text and text.strip():
                pages.append(text.strip())
    return "\n\n".join(pages)


# ── 智能分章 ──

CHAPTER_PATTERNS = [
    re.compile(r"^第[一二三四五六七八九十百零\d]+[章节篇部分]\s", re.MULTILINE),
    re.compile(r"^Chapter\s+\d+", re.MULTILINE | re.IGNORECASE),
    re.compile(r"^#{1,2}\s+\S", re.MULTILINE),
]


def split_into_sections(text: str, max_chunk: int = 3000) -> list[dict[str, str]]:
    """
    把全文按章节标题切分。如果切出来的块超过 max_chunk 字符，
    再按段落等分。返回 [{"title": ..., "content": ...}, ...]
    """
    # 找最佳分割模式
    split_pattern = None
    for pat in CHAPTER_PATTERNS:
        if pat.search(text):
            split_pattern = pat
            break

    if split_pattern is None:
        # 没有章节标记，按固定长度切
        return _fixed_split(text, max_chunk)

    # 按章节标记分割
    parts = split_pattern.split(text)
    # split 结果: [前言, 标题1, 内容1, 标题2, 内容2, ...]
    sections = []
    if parts[0].strip():
        sections.append({"title": "前言", "content": parts[0].strip()})

    i = 1
    while i < len(parts) - 1:
        title = parts[i].strip()[:120]
        content = parts[i + 1].strip() if i + 1 < len(parts) else ""
        if content:
            # 如果章节太长，再等分
            if len(content) > max_chunk:
                for j, sub in enumerate(_chunk_by_length(content, max_chunk)):
                    sections.append({
                        "title": f"{title}（{j + 1}）",
                        "content": sub,
                    })
            else:
                sections.append({"title": title, "content": content})
        i += 2

    return sections


def _fixed_split(text: str, max_chunk: int) -> list[dict[str, str]]:
    """按固定长度切分，尽量在段落边界切。"""
    paragraphs = text.split("\n")
    chunks = []
    current = ""
    for p in paragraphs:
        if len(current) + len(p) > max_chunk and current:
            chunks.append(current.strip())
            current = p
        else:
            current += "\n" + p if current else p
    if current.strip():
        chunks.append(current.strip())
    return [{"title": f"段落 {i + 1}", "content": c} for i, c in enumerate(chunks)]


def _chunk_by_length(text: str, max_len: int) -> list[str]:
    paragraphs = text.split("\n")
    chunks = []
    current = ""
    for p in paragraphs:
        if len(current) + len(p) > max_len and current:
            chunks.append(current.strip())
            current = p
        else:
            current += "\n" + p if current else p
    if current.strip():
        chunks.append(current.strip())
    return chunks


# ── 导入逻辑 ──

async def ingest_file(
    file_path: str,
    subject: str = "",
    tags_extra: list[str] | None = None,
) -> int:
    """导入单个 PDF，返回导入的文档数。"""
    rag = RAGPipeline()
    existing = {d["title"] for d in rag.list_documents()}
    tags_extra = tags_extra or []

    print(f"📄 处理: {file_path}")
    text = extract_text_from_pdf(file_path)
    if not text.strip():
        print(f"  ⚠ 空文件，跳过")
        return 0

    sections = split_into_sections(text)
    count = 0
    filename = Path(file_path).stem

    for sec in sections:
        title = f"{subject} · {filename} · {sec['title']}" if subject else f"{filename} · {sec['title']}"
        # 去重
        if title in existing:
            print(f"  ⏭ 已存在: {title[:60]}")
            continue

        tags = [*tags_extra]
        if subject:
            tags.append(subject)
        tags.append("408")
        tags.append(filename)

        rag.add_document(
            title=title,
            content=sec["content"],
            tags=tags,
            source=f"pdf:{file_path}",
        )
        count += 1
        print(f"  ✅ {title[:60]}  ({len(sec['content'])} 字)")

    return count


async def main():
    parser = argparse.ArgumentParser(description="导入 PDF 到 ZhiPath 知识库")
    parser.add_argument("path", help="PDF 文件或目录路径")
    parser.add_argument("--subject", default="", help="科目名称（如 '数据结构'）")
    parser.add_argument("--tags", nargs="*", default=[], help="额外标签")
    args = parser.parse_args()

    path = Path(args.path)
    if not path.exists():
        print(f"❌ 路径不存在: {path}")
        sys.exit(1)

    # 收集 PDF 文件
    if path.is_file():
        pdf_files = [str(path)]
    else:
        pdf_files = sorted(str(p) for p in path.rglob("*.pdf"))

    if not pdf_files:
        print(f"❌ 未找到 PDF 文件: {path}")
        sys.exit(1)

    print(f"📚 找到 {len(pdf_files)} 个 PDF，开始导入...\n")
    total = 0
    for pdf in pdf_files:
        total += await ingest_file(pdf, args.subject, args.tags)

    print(f"\n✨ 导入完成: {total} 个文档段已入库")


if __name__ == "__main__":
    asyncio.run(main())
