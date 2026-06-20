"""把 document_chunks 表里每个 chunk 的 content 用当前配置的 embedding 重新编码并原地更新。

幂等：直接 UPDATE embedding 列，不删不加、不依赖 kb-final、可中断重跑。
用法：python scripts/reembed_chunks.py
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import bootstrap_env  # noqa: E402
bootstrap_env.load_project_env()

from sqlalchemy import select, update  # noqa: E402
from services.database import get_db  # noqa: E402
from services.models import DocumentChunkModel  # noqa: E402
from services.rag.embeddings import get_embeddings  # noqa: E402

BATCH = 50


async def main() -> None:
    e = get_embeddings()
    async with get_db() as db:
        rows = (await db.execute(
            select(DocumentChunkModel.id, DocumentChunkModel.content)
        )).all()
    total = len(rows)
    print(f"re-embedding {total} chunks via {type(e).__name__}", flush=True)

    done = 0
    for i in range(0, total, BATCH):
        batch = rows[i:i + BATCH]
        texts = [((r[1] or " ").strip() or " ") for r in batch]
        embs = await asyncio.to_thread(e.embed_documents, texts)
        async with get_db() as db:
            for (cid, _), emb in zip(batch, embs):
                await db.execute(
                    update(DocumentChunkModel)
                    .where(DocumentChunkModel.id == cid)
                    .values(embedding=emb)
                )
            await db.commit()
        done += len(batch)
        print(f"  {done}/{total}", flush=True)
    print("DONE", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
