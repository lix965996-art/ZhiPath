#!/usr/bin/env python3
from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = PROJECT_ROOT / "backend"
sys.path.insert(0, str(BACKEND_ROOT))

from bootstrap_env import load_project_env  # noqa: E402
from rag.kb_loader import DEFAULT_KB_ROOT, import_kb_final  # noqa: E402


async def main() -> None:
    parser = argparse.ArgumentParser(description="Import LearnFlow 408 kb-final into the existing RAG store.")
    parser.add_argument(
        "--kb-root",
        default=str(DEFAULT_KB_ROOT),
        help="Path to kb-final. Default: LearnFlow/Data/kb-final",
    )
    parser.add_argument(
        "--no-vector",
        action="store_true",
        help="Only write JSON fallback documents, skip pgvector embedding/indexing.",
    )
    parser.add_argument(
        "--append",
        action="store_true",
        help="Append to the current knowledge store instead of replacing it.",
    )
    args = parser.parse_args()

    load_project_env()
    result = await import_kb_final(args.kb_root, index_vector=not args.no_vector, replace=not args.append)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
