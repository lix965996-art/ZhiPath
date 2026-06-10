"""Quick verification that 408 knowledge base is working."""
import asyncio, sys
sys.path.insert(0, ".")
from services.rag.pipeline import RAGPipeline

async def test():
    rag = RAGPipeline()
    docs = await rag.list_documents()
    print(f"Total docs: {len(docs)}")
    for d in docs:
        print(f"  - {d.get('title', '?')[:60]}")

    results = await rag.search("AVL平衡二叉树旋转", k=3)
    print(f"\nSearch 'AVL': {len(results)} hits")
    for r in results:
        print(f"  [{r.score:.3f}] {r.title[:50]}")

    results2 = await rag.search("TCP三次握手", k=3)
    print(f"\nSearch 'TCP三次握手': {len(results2)} hits")
    for r in results2:
        print(f"  [{r.score:.3f}] {r.title[:50]}")

    results3 = await rag.search("银行家算法死锁", k=3)
    print(f"\nSearch '银行家算法': {len(results3)} hits")
    for r in results3:
        print(f"  [{r.score:.3f}] {r.title[:50]}")

asyncio.run(test())
