from __future__ import annotations

import asyncio
import logging
import re
from pathlib import Path
from typing import Any

from sqlalchemy import delete

from services.database import get_db
from services.models import DocumentModel
from services.rag.pipeline import RAGPipeline

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_KB_ROOT = PROJECT_ROOT / "Data" / "kb-final"
logger = logging.getLogger(__name__)

ALLOWED_EXTENSIONS = {".md", ".py", ".c", ".h", ".S"}
EXCLUDED_DIRS = {".git", "node_modules", "__pycache__", ".pytest_cache"}
EXCLUDED_FILES = {"package.json", "Makefile"}


def iter_kb_files(kb_root: Path = DEFAULT_KB_ROOT) -> list[Path]:
    """Return text files from kb-final that should enter the 408 knowledge base."""
    kb_root = kb_root.resolve()
    files: list[Path] = []
    for path in kb_root.rglob("*"):
        if any(part in EXCLUDED_DIRS for part in path.parts):
            continue
        if not path.is_file():
            continue
        if path.name in EXCLUDED_FILES:
            continue
        if path.suffix not in ALLOWED_EXTENSIONS:
            continue
        files.append(path)
    return sorted(files)


def split_text(text: str, chunk_size: int = 1000, overlap: int = 150) -> list[str]:
    """Split text into about 800-1200 character chunks with 100-200 overlap."""
    cleaned = text.replace("\ufeff", "").strip()
    if not cleaned:
        return []
    if len(cleaned) <= chunk_size:
        return [cleaned]

    chunks: list[str] = []
    start = 0
    min_size = 800
    max_size = 1200
    overlap = max(100, min(overlap, 200))
    while start < len(cleaned):
        hard_end = min(start + max_size, len(cleaned))
        if hard_end == len(cleaned):
            end = hard_end
        else:
            soft_start = min(start + min_size, hard_end)
            window = cleaned[soft_start:hard_end]
            cut = max(
                window.rfind("\n## "),
                window.rfind("\n# "),
                window.rfind("\n\n"),
                window.rfind("。"),
                window.rfind("；"),
                window.rfind(";"),
                window.rfind(". "),
            )
            end = soft_start + cut + 1 if cut >= 0 else min(start + chunk_size, hard_end)

        chunk = cleaned[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end >= len(cleaned):
            break
        start = max(end - overlap, start + 1)
    return chunks


def infer_course(path: Path, kb_root: Path = DEFAULT_KB_ROOT) -> str:
    try:
        return path.resolve().relative_to(kb_root.resolve()).parts[0]
    except (ValueError, IndexError):
        return "408"


def infer_type(path: Path) -> str:
    parts = set(path.parts)
    name = path.name
    if "07-实验案例" in parts or path.suffix in {".py", ".c", ".h", ".S"}:
        return "实验代码"
    if "05-习题库" in parts or "06-历年真题" in parts or re.search(r"20\d{2}|19\d{2}", name):
        return "习题"
    return "讲义"


def read_text_file(path: Path) -> str:
    for encoding in ("utf-8", "utf-8-sig", "gb18030"):
        try:
            return path.read_text(encoding=encoding)
        except UnicodeDecodeError:
            continue
    return path.read_text(encoding="utf-8", errors="ignore")


async def import_kb_final(
    kb_root: str | Path = DEFAULT_KB_ROOT,
    *,
    index_vector: bool = True,
    replace: bool = True,
) -> dict[str, Any]:
    """Import kb-final chunks into the existing RAGPipeline/pgvector path."""
    root = Path(kb_root).resolve()
    if not root.is_dir():
        raise FileNotFoundError(f"kb-final directory not found: {root}")

    rag = RAGPipeline()
    if replace:
        rag._write_docs([])
        await _clear_vector_documents()

    existing_docs = rag._read_docs()  # Reuse the existing JSON fallback store.
    existing_keys = {
        (
            str(doc.get("source_path", "")),
            str(doc.get("title", "")),
        )
        for doc in existing_docs
        if str(doc.get("source", "")).startswith("kb-final")
    }

    files = iter_kb_files(root)
    added = 0
    skipped = 0
    failed: list[dict[str, str]] = []
    courses: dict[str, int] = {}

    for path in files:
        try:
            raw_text = read_text_file(path)
            chunks = split_text(raw_text)
            if not chunks:
                continue

            rel = path.resolve().relative_to(root).as_posix()
            course = infer_course(path, root)
            doc_type = infer_type(path)
            file_ext = path.suffix.lstrip(".")
            courses[course] = courses.get(course, 0) + len(chunks)

            for index, chunk in enumerate(chunks, start=1):
                title = f"408 · {course} · {path.stem} · chunk {index:03d}"
                key = (rel, title)
                if key in existing_keys:
                    skipped += 1
                    continue

                await rag.add_document(
                    title=title,
                    content=chunk,
                    tags=["408", "kb-final", course, doc_type, file_ext],
                    source="kb-final",
                    metadata={
                        "source_path": rel,
                        "course": course,
                        "type": doc_type,
                        "file_ext": file_ext,
                    },
                    index_vector=index_vector,
                )
                existing_keys.add(key)
                added += 1
        except Exception as exc:
            failed.append({"path": str(path), "error": str(exc)})

    return {
        "kb_root": str(root),
        "files": len(files),
        "added_chunks": added,
        "skipped_chunks": skipped,
        "failed": failed,
        "courses": courses,
        "vector_indexed": index_vector,
        "replaced_existing": replace,
    }


async def _clear_vector_documents() -> None:
    try:
        async with get_db() as db:
            await db.execute(delete(DocumentModel))
            await db.commit()
    except Exception as exc:
        logger.info("Vector document clear skipped: %s", exc)


def import_kb_final_sync(
    kb_root: str | Path = DEFAULT_KB_ROOT,
    *,
    index_vector: bool = True,
    replace: bool = True,
) -> dict[str, Any]:
    return asyncio.run(import_kb_final(kb_root, index_vector=index_vector, replace=replace))
