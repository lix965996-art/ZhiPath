from __future__ import annotations

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from services.database import get_db
from services.models import MessageModel, SessionModel
from services.rag.pipeline import RAGPipeline

router = APIRouter(prefix="/api/v1/knowledge", tags=["knowledge"])
_rag: RAGPipeline | None = None


def _get_rag() -> RAGPipeline:
    global _rag
    if _rag is None:
        _rag = RAGPipeline()
    return _rag


class AddDocumentRequest(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    content: str = Field(min_length=1)
    tags: list[str] = Field(default_factory=list)


@router.get("/documents")
async def list_documents():
    return await _get_rag().list_documents()


@router.post("/documents")
async def add_document(req: AddDocumentRequest):
    doc = await _get_rag().add_document(
        title=req.title,
        content=req.content,
        tags=req.tags,
        source="api",
    )
    return {
        "id": doc["id"],
        "title": doc["title"],
        "tags": doc["tags"],
        "created_at": doc["created_at"],
    }


@router.get("/search")
async def search_knowledge(q: str = Query(min_length=1), k: int = 5):
    return [
        {
            "document_id": chunk.document_id,
            "title": chunk.title,
            "content": chunk.content,
            "tags": chunk.tags,
            "score": round(chunk.score, 4),
            "retrieval_mode": chunk.retrieval_mode,
            "source_path": chunk.source_path,
            "course": chunk.course,
            "type": chunk.type,
            "file_ext": chunk.file_ext,
        }
        for chunk in await _get_rag().search(q, k=k)
    ]


@router.get("/topology")
async def knowledge_topology():
    """返回知识库拓扑: 文档节点 + 真 embedding 相似度边.

    用 chunk embedding 平均当 doc embedding, 算 cosine 相似度矩阵.
    只保留 sim >= 阈值的边, 避免完全图.
    """
    return await _get_rag().compute_topology()


@router.get("/semantic_map")
async def semantic_map():
    """768d embedding 真 PCA 投影 2D 语义平面. 文档位置 = 模型真实语义距离."""
    return await _get_rag().compute_semantic_map()


@router.get("/project_query")
async def project_query(q: str = Query(min_length=1), k: int = 5):
    """把 query 用同一组 PCA 主成分投影到语义平面, 返回落点 + 真 cosine top-k."""
    return await _get_rag().project_query_semantic(q, k=k)


# ── 408 考点关键词映射 ──────────────────────────────────────────

KC_KEYWORDS = {
    "ds_linear": ["线性表", "链表", "顺序表", "栈", "队列"],
    "ds_tree": ["二叉树", "树", "遍历", "binary_tree", "tree_node"],
    "ds_avl": ["avl", "平衡", "红黑"],
    "ds_graph": ["图", "最短路径", "dijkstra", "拓扑", "生成树", "graph"],
    "ds_sort": ["排序", "快速排序", "堆排序", "归并", "sort"],
    "ds_hash": ["查找", "哈希", "散列", "折半", "b树", "hash"],
    "co_data": ["补码", "原码", "浮点", "数据表示", "ieee"],
    "co_cache": ["cache", "映射", "直接映射", "组相联", "存储系统"],
    "co_inst": ["指令", "寻址", "寻址方式", "cisc", "risc"],
    "co_cpu": ["cpu", "流水线", "数据通路", "控制器"],
    "co_mem": ["主存", "存储器", "dram", "sram"],
    "co_bus": ["总线", "中断", "dma", "io"],
    "os_proc": ["进程", "线程", "pcb", "进程状态"],
    "os_sched": ["调度", "fcfs", "sjf", "时间片", "周转"],
    "os_deadlock": ["死锁", "银行家", "资源分配"],
    "os_mem": ["内存管理", "分页", "分段", "页表", "地址转换"],
    "os_vm": ["虚拟内存", "请求分页", "页面置换", "lru", "缺页"],
    "os_file": ["文件", "磁盘调度", "目录", "索引"],
    "cn_phys": ["物理层", "信道", "编码", "奈奎斯特"],
    "cn_link": ["数据链路", "帧", "crc", "csma", "以太网", "滑动窗口"],
    "cn_net": ["网络层", "ip", "路由", "子网", "arp", "cidr"],
    "cn_tcp": ["tcp", "三次握手", "拥塞控制", "运输层", "可靠传输"],
    "cn_app": ["应用层", "dns", "http", "https", "smtp"],
}


@router.get("/learning_history")
async def learning_history():
    """统计每个 408 考点的学习次数（基于会话消息关键词命中）。

    返回格式: { "ds_linear": 5, "ds_tree": 3, ... }
    """
    try:
        async with get_db() as db:
            # 获取所有会话消息
            result = await db.execute(
                select(MessageModel.content)
                .where(MessageModel.role == "user")
            )
            messages = [row[0] for row in result.all()]
    except Exception:
        # 数据库不可用时返回空
        return {kc_id: 0 for kc_id in KC_KEYWORDS}

    # 统计每个知识点的命中次数
    counts = {kc_id: 0 for kc_id in KC_KEYWORDS}

    for msg in messages:
        msg_lower = msg.lower()
        for kc_id, keywords in KC_KEYWORDS.items():
            if any(kw in msg_lower for kw in keywords):
                counts[kc_id] += 1

    return counts
