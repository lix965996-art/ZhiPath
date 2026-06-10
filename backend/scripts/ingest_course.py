"""灌入 data/knowledge/<course_id>/ 下所有章节 .md 到 RAG。

用法:
    python scripts/ingest_course.py ml_course

每章一个 RAGPipeline.add_document，标签 = manifest tags + 章节 id。
幂等：标题相同时跳过 (不重复入库)。
"""
from __future__ import annotations

import asyncio
import json
import re
import sys
from pathlib import Path

# 让 backend 包可 import
BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from services.rag.pipeline import RAGPipeline  # noqa: E402


def parse_frontmatter(text: str) -> tuple[dict, str]:
    """解析 markdown 顶部 > tags: ..., 难度: ..., 前置: ... 元数据。"""
    meta: dict = {}
    lines = text.splitlines()
    body_start = 0
    for i, line in enumerate(lines):
        if not line.startswith(">"):
            if i > 0:
                body_start = i
                break
            continue
        content = line.lstrip(">").strip()
        for key in ("tags", "难度", "前置"):
            if content.startswith(key + ":") or content.startswith(key + ":"):
                value = content.split(":", 1)[1].strip().lstrip(":").strip()
                meta[key] = value
                break
    body = "\n".join(lines[body_start:]).strip() if body_start else text
    return meta, body


def extract_tags(meta: dict, chapter_id: str) -> list[str]:
    tags = []
    raw = meta.get("tags", "")
    if raw:
        for t in re.split(r"[,，、\s]+", raw):
            t = t.strip()
            if t:
                tags.append(t)
    tags.append(chapter_id)
    return tags


def extract_title(body: str, default: str) -> str:
    """取第一个 # 行作为标题。"""
    for line in body.splitlines():
        line = line.strip()
        if line.startswith("# "):
            return line.lstrip("# ").strip()
    return default


async def ingest_course(course_id: str) -> dict:
    course_dir = BACKEND_ROOT / "data" / "knowledge" / course_id
    if not course_dir.is_dir():
        raise FileNotFoundError(f"course dir not found: {course_dir}")

    manifest_file = course_dir / "_manifest.json"
    if not manifest_file.is_file():
        raise FileNotFoundError(f"manifest missing: {manifest_file}")

    manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
    course_name = manifest.get("course_name", course_id)
    chapters = manifest.get("chapters", [])

    rag = RAGPipeline()
    existing = await rag.list_documents()
    existing_titles = {str(d.get("title", "")).strip() for d in existing}

    added: list[str] = []
    skipped: list[str] = []

    for chap in chapters:
        chap_id = chap["id"]
        chap_title = chap.get("title", chap_id)
        md_file = course_dir / f"{chap_id}.md"
        if not md_file.is_file():
            print(f"⚠ missing {md_file.name}, skip")
            continue

        text = md_file.read_text(encoding="utf-8")
        meta, body = parse_frontmatter(text)
        title = f"{course_name} · 第 {chapters.index(chap)+1} 章 {chap_title}"

        if title in existing_titles:
            skipped.append(title)
            continue

        tags = extract_tags(meta, chap_id)
        tags.append(course_id)

        await rag.add_document(
            title=title,
            content=body,
            tags=tags,
            source=f"course:{course_id}",
        )
        added.append(title)
        print(f"✓ {title}  ({len(body)} 字, tags={tags[:3]}...)")

    return {
        "course_id": course_id,
        "course_name": course_name,
        "total_chapters": len(chapters),
        "added": len(added),
        "skipped": len(skipped),
        "added_titles": added,
    }


def main():
    course_id = sys.argv[1] if len(sys.argv) > 1 else "ml_course"
    result = asyncio.run(ingest_course(course_id))
    print()
    print("=" * 60)
    print(f"课程: {result['course_name']}")
    print(f"章节总数: {result['total_chapters']}")
    print(f"本次新增: {result['added']}")
    print(f"跳过 (已存在): {result['skipped']}")


if __name__ == "__main__":
    main()
