#!/usr/bin/env python3
"""
ingest_408.py — 把 cs404 目录下的 markdown 和 PDF 导入知识库。

用法:
    python scripts/ingest_408.py
"""
import asyncio
import re
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from services.rag.pipeline import RAGPipeline

SUBJECT_MAP = {
    "ds": "数据结构",
    "co": "计算机组成原理",
    "os": "操作系统",
    "cn": "计算机网络",
}

KNOWLEDGE_DIR = PROJECT_ROOT / "data" / "knowledge" / "cs404"


def parse_frontmatter(text: str):
    """解析 > tags: ... / > 难度: ... / > 前置: ..."""
    tags = []
    difficulty = 0.3
    for line in text.split("\n"):
        line = line.strip()
        if not line.startswith(">"):
            break
        if line.startswith("> tags:"):
            tags = [t.strip() for t in line[len("> tags:"):].split(",") if t.strip()]
        elif line.startswith("> 难度:"):
            try:
                difficulty = float(line[len("> 难度:"):].strip())
            except ValueError:
                pass
    return tags, difficulty


def extract_title(text: str) -> str:
    for line in text.split("\n"):
        line = line.strip()
        if line.startswith("# "):
            return line[2:].strip()
    return ""


async def main():
    rag = RAGPipeline()
    existing = {d["title"] for d in await rag.list_documents()}

    md_files = sorted(KNOWLEDGE_DIR.glob("*.md"))
    if not md_files:
        print("❌ 未找到 markdown 文件")
        return

    print(f"[408] 找到 {len(md_files)} 个章节文件，开始导入...\n")
    count = 0

    for f in md_files:
        text = f.read_text(encoding="utf-8")
        tags, difficulty = parse_frontmatter(text)
        title = extract_title(text)

        if not title:
            title = f.stem

        full_title = f"408计算机基础 · {title}"

        if full_title in existing:
            print(f"  [skip] 已存在: {full_title[:60]}")
            continue

        # 去掉 frontmatter
        body_lines = []
        in_fm = True
        for line in text.split("\n"):
            if in_fm and line.startswith(">"):
                continue
            in_fm = False
            body_lines.append(line)
        body = "\n".join(body_lines).strip()

        # 推断科目标签
        stem = f.stem
        subject_prefix = stem.split("_")[0] if "_" in stem else ""
        subject_label = SUBJECT_MAP.get(subject_prefix, "")
        all_tags = list(set(tags + ["408", "考研", "计算机专业基础"] + ([subject_label] if subject_label else [])))

        await rag.add_document(title=full_title, content=body, tags=all_tags, source="course:cs404")
        count += 1
        print(f"  [OK] {full_title[:60]}  ({len(body)} zi)")

    print(f"\n[Done] 导入完成: {count} 个文档段已入库")


if __name__ == "__main__":
    asyncio.run(main())
