from __future__ import annotations

import json
import logging
import math
import os
import re
import uuid
import asyncio
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from services.database import get_db
from services.models import DocumentChunkModel, DocumentModel
from services.rag.embeddings import get_embeddings

logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "knowledge"
DOCUMENTS_FILE = DATA_DIR / "documents.json"

SEED_DOCUMENTS = [
    # ── 数据结构 ──────────────────────────────────────────────
    {
        "title": "408 数据结构：线性表",
        "content": (
            "## 线性表\n"
            "线性表是最基本的数据结构，包含顺序存储（数组）和链式存储（链表）两种实现。\n\n"
            "顺序表支持随机访问，时间复杂度 O(1)；插入删除需要移动元素，平均 O(n)。\n"
            "单链表不支持随机访问，查找 O(n)；插入删除只需修改指针，O(1)（已知位置时）。\n"
            "双向链表可双向遍历；循环链表尾结点指向头结点。\n\n"
            "408 常考点：顺序表与链表的对比、头插法/尾插法建表、链表逆序、找中间结点（快慢指针）。"
        ),
        "tags": ["408", "数据结构", "线性表", "链表"],
    },
    {
        "title": "408 数据结构：栈和队列",
        "content": (
            "## 栈和队列\n"
            "栈是后进先出（LIFO），支持 push/pop 操作；队列是先进先出（FIFO），支持 enqueue/dequeue。\n\n"
            "顺序栈用数组实现，top 指针指向栈顶；链栈用链表实现。\n"
            "循环队列用数组实现，队满条件 `(rear+1)%maxsize == front`，牺牲一个存储单元区分队空和队满。\n\n"
            "408 常考点：栈的应用（括号匹配、表达式求值、递归转非递归）、循环队列元素个数计算 `(rear-front+maxsize)%maxsize`。"
        ),
        "tags": ["408", "数据结构", "栈", "队列"],
    },
    {
        "title": "408 数据结构：二叉树遍历",
        "content": (
            "## 二叉树遍历\n"
            "先序遍历顺序为根、左、右；中序遍历顺序为左、根、右；后序遍历顺序为左、右、根；层次遍历按层从左到右访问。\n\n"
            "已知先序和中序，或后序和中序，通常可以唯一确定一棵二叉树；但仅知道先序和后序一般不能唯一确定。\n"
            "408 常考根据遍历序列还原二叉树、判断线索二叉树、计算结点度数关系。"
        ),
        "tags": ["408", "数据结构", "二叉树", "遍历"],
    },
    {
        "title": "408 数据结构：图",
        "content": (
            "## 图\n"
            "图的存储方式：邻接矩阵（适合稠密图）、邻接表（适合稀疏图）、十字链表、邻接多重表。\n\n"
            "深度优先搜索（DFS）类似树的先序遍历，用栈或递归实现；广度优先搜索（BFS）类似层次遍历，用队列实现。\n"
            "最小生成树：Prim 算法（从顶点出发，适合稠密图）、Kruskal 算法（从边出发，适合稀疏图）。\n"
            "最短路径：Dijkstra 算法（单源，不含负权边）、Floyd 算法（各顶点间，含负权边但不含负权回路）。\n\n"
            "408 常考点：拓扑排序（AOV 网）、关键路径（AOE 网）、DFS/BFS 遍历序列。"
        ),
        "tags": ["408", "数据结构", "图", "最短路径", "生成树"],
    },
    {
        "title": "408 数据结构：查找",
        "content": (
            "## 查找\n"
            "顺序查找：逐个比较，平均比较次数 (n+1)/2，时间复杂度 O(n)。\n"
            "折半查找：要求有序顺序表，每次取中间元素比较，时间复杂度 O(log₂n)。\n"
            "B 树和 B+ 树：多路平衡查找树，B+ 树所有关键字都在叶子结点，适合文件系统和数据库索引。\n"
            "散列表（哈希表）：通过散列函数直接计算存储位置，处理冲突的方法有开放定址法和链地址法。\n\n"
            "408 常考点：折半查找的判定树、散列表的装填因子、ASL 计算。"
        ),
        "tags": ["408", "数据结构", "查找", "B树", "哈希"],
    },
    {
        "title": "408 数据结构：排序",
        "content": (
            "## 排序\n"
            "插入排序：直接插入排序 O(n²)、折半插入排序 O(n²)、希尔排序（不稳定）。\n"
            "交换排序：冒泡排序 O(n²)、快速排序平均 O(nlogn)，最坏 O(n²)（不稳定）。\n"
            "选择排序：简单选择排序 O(n²)、堆排序 O(nlogn)（不稳定）。\n"
            "归并排序：O(nlogn)，稳定，需要额外 O(n) 空间。\n"
            "基数排序：O(d(n+r))，稳定，适用于关键字位数较少的情况。\n\n"
            "408 常考点：各排序算法的时间/空间复杂度和稳定性对比、一趟排序后的结果、堆的调整过程。"
        ),
        "tags": ["408", "数据结构", "排序", "快速排序", "堆排序"],
    },
    # ── 计算机组成原理 ────────────────────────────────────────
    {
        "title": "408 计算机组成原理：Cache 映射方式",
        "content": (
            "## Cache 映射方式\n"
            "Cache 与主存之间常见三种映射方式：直接映射、全相联映射、组相联映射。\n\n"
            "直接映射中，每个主存块只能放入 Cache 的唯一位置，实现简单但冲突率较高。\n"
            "全相联映射中，主存块可以放入 Cache 任意位置，冲突率低但比较电路复杂。\n"
            "组相联映射把 Cache 分成若干组，主存块先映射到固定组，再在组内任选一行，是直接映射和全相联映射的折中。\n\n"
            "408 题目常结合地址位划分，要求计算标记位、组号或行号、块内地址。"
        ),
        "tags": ["408", "计算机组成原理", "Cache", "存储系统"],
    },
    {
        "title": "408 计算机组成原理：数据表示",
        "content": (
            "## 数据表示\n"
            "原码：最高位符号位，其余位表示绝对值。+0 和 -0 表示不同。\n"
            "反码：正数同原码；负数符号位不变，其余位取反。\n"
            "补码：正数同原码；负数在反码基础上加 1。零的表示唯一。\n"
            "移码：补码符号位取反，用于浮点数阶码。\n\n"
            "浮点数表示：N = (-1)^s × M × R^E，IEEE 754 标准（单精度 32 位、双精度 64 位）。\n\n"
            "408 常考点：补码加减运算、溢出判断（双符号位法）、浮点数规格化、IEEE 754 编码。"
        ),
        "tags": ["408", "计算机组成原理", "数据表示", "补码", "浮点数"],
    },
    {
        "title": "408 计算机组成原理：指令系统",
        "content": (
            "## 指令系统\n"
            "指令格式：操作码 + 地址码。地址码可以是三地址、二地址、一地址、零地址。\n"
            "寻址方式：立即寻址、直接寻址、间接寻址、寄存器寻址、寄存器间接寻址、基址寻址、变址寻址、相对寻址。\n"
            "CISC vs RISC：CISC 指令多而复杂，RISC 指令少而简单，采用流水线技术。\n\n"
            "408 常考点：各种寻址方式的有效地址计算、指令长度与地址码位数的关系。"
        ),
        "tags": ["408", "计算机组成原理", "指令系统", "寻址方式"],
    },
    {
        "title": "408 计算机组成原理：CPU",
        "content": (
            "## CPU\n"
            "CPU 由运算器和控制器组成。运算器包含 ALU、累加器、状态寄存器；控制器包含 PC、IR、指令译码器。\n"
            "数据通路：寄存器之间、寄存器与 ALU 之间的数据传输路径。\n"
            "流水线技术：将指令执行分为取指、译码、执行、访存、写回等阶段，提高吞吐率。\n"
            "流水线冲突：结构冲突（资源冲突）、数据冲突（RAW/WAR/WAW）、控制冲突（分支指令）。\n\n"
            "408 常考点：流水线吞吐率和加速比计算、数据冲突的处理（旁路转发、流水线暂停）。"
        ),
        "tags": ["408", "计算机组成原理", "CPU", "流水线"],
    },
    {
        "title": "408 计算机组成原理：总线和 I/O",
        "content": (
            "## 总线\n"
            "总线是计算机各部件之间传送数据的公共通道。分为数据总线、地址总线、控制总线。\n"
            "同步总线由统一时钟控制；异步总线用握手信号协调，分为不互锁、半互锁、全互锁。\n\n"
            "## I/O 系统\n"
            "I/O 方式：程序查询方式（CPU 忙等）、程序中断方式（CPU 响应中断）、DMA 方式（DMA 控制器直接访问主存）、通道方式。\n"
            "DMA 与中断的区别：DMA 在传送结束时才中断 CPU，中断方式每传一个字就中断一次。\n\n"
            "408 常考点：总线带宽计算、中断响应过程、DMA 传送过程。"
        ),
        "tags": ["408", "计算机组成原理", "总线", "I/O", "中断", "DMA"],
    },
    # ── 操作系统 ──────────────────────────────────────────────
    {
        "title": "408 操作系统：死锁",
        "content": (
            "## 死锁定义\n"
            "死锁是指多个进程因竞争资源而造成的一种互相等待状态。若无外力干预，这些进程都无法继续推进。\n\n"
            "## 四个必要条件\n"
            "1. 互斥：资源一次只能被一个进程占有。\n"
            "2. 不剥夺：进程已获得的资源在未使用完前不能被强行夺走。\n"
            "3. 请求并保持：进程已经保持至少一个资源，同时又请求新的资源。\n"
            "4. 循环等待：存在一个进程资源等待环。\n\n"
            "## 408 常考处理策略\n"
            "死锁预防通过破坏必要条件避免死锁；死锁避免通过银行家算法等方法判断系统是否处于安全状态；死锁检测与解除允许死锁发生后再发现并恢复。"
        ),
        "tags": ["408", "操作系统", "死锁", "进程管理"],
    },
    {
        "title": "408 操作系统：进程管理",
        "content": (
            "## 进程管理\n"
            "进程是资源分配的基本单位，由程序段、数据段和 PCB 组成。进程的三种状态：就绪、执行、阻塞。\n"
            "进程控制：创建、终止、阻塞、唤醒、切换，通过原语实现。\n"
            "进程通信：共享存储、消息传递、管道通信。\n\n"
            "## 处理机调度\n"
            "高级调度（作业调度）、中级调度（内存调度）、低级调度（进程调度）。\n"
            "调度算法：FCFS、SJF、优先级调度、时间片轮转、多级反馈队列。\n\n"
            "408 常考点：进程状态转换图、调度算法的周转时间/等待时间计算、优先级反转。"
        ),
        "tags": ["408", "操作系统", "进程", "调度"],
    },
    {
        "title": "408 操作系统：内存管理",
        "content": (
            "## 内存管理\n"
            "连续分配：单一连续分配、固定分区分配、动态分区分配（首次适应、最佳适应、最坏适应）。\n"
            "非连续分配：分页（页表、TLB 快表）、分段（段表）、段页式。\n\n"
            "虚拟内存：请求分页、请求分段。页面置换算法：OPT、FIFO、LRU、Clock（NRU）。\n"
            "抖动（颠簸）：页面频繁换入换出，原因是分配给进程的物理块数不足。\n\n"
            "408 常考点：地址转换过程、页表项计算、缺页中断处理、页面置换算法的缺页次数。"
        ),
        "tags": ["408", "操作系统", "内存管理", "虚拟内存", "页面置换"],
    },
    {
        "title": "408 操作系统：文件管理",
        "content": (
            "## 文件管理\n"
            "文件逻辑结构：有结构文件（顺序文件、索引文件、索引顺序文件）、无结构文件（流式文件）。\n"
            "文件物理结构：连续分配、链接分配（隐式/显式）、索引分配（多级索引）。\n"
            "目录：单级目录、两级目录、树形目录、无环图目录。\n"
            "磁盘调度算法：FCFS、SSTF、SCAN（电梯算法）、C-SCAN。\n\n"
            "408 常考点：文件存储空间管理（位示图法、空闲链表法）、磁盘调度算法的寻道时间计算。"
        ),
        "tags": ["408", "操作系统", "文件管理", "磁盘调度"],
    },
    # ── 计算机网络 ────────────────────────────────────────────
    {
        "title": "408 计算机网络：TCP 三次握手",
        "content": (
            "## TCP 三次握手\n"
            "第一次握手：客户端发送 SYN，进入 SYN-SENT 状态。\n"
            "第二次握手：服务器收到 SYN 后回复 SYN+ACK，进入 SYN-RCVD 状态。\n"
            "第三次握手：客户端收到后发送 ACK，双方进入 ESTABLISHED 状态。\n\n"
            "三次握手的核心目的，是确认双方发送和接收能力均正常，并同步初始序号。\n"
            "408 常考点包括：为什么不是两次握手、SYN/ACK 标志位、序号确认号变化、连接建立状态迁移。"
        ),
        "tags": ["408", "计算机网络", "TCP", "传输层"],
    },
    {
        "title": "408 计算机网络：TCP 拥塞控制",
        "content": (
            "## TCP 拥塞控制\n"
            "四种拥塞控制算法：慢开始、拥塞避免、快重传、快恢复。\n\n"
            "慢开始：拥塞窗口从 1 开始，每经过一个 RTT 翻倍，直到达到慢开始门限 ssthresh。\n"
            "拥塞避免：窗口达到 ssthresh 后，每个 RTT 加 1，线性增长。\n"
            "出现超时：ssthresh = 当前窗口/2，窗口回到 1，重新慢开始。\n"
            "快重传：连续收到 3 个重复 ACK，立即重传丢失报文段。\n"
            "快恢复：ssthresh = 当前窗口/2，窗口 = ssthresh，进入拥塞避免。\n\n"
            "408 常考点：根据 RTT 序列画拥塞窗口变化曲线、计算吞吐量。"
        ),
        "tags": ["408", "计算机网络", "TCP", "拥塞控制"],
    },
    {
        "title": "408 计算机网络：IP 协议与路由",
        "content": (
            "## IP 协议\n"
            "IPv4 地址分类：A 类（0~127）、B 类（128~191）、C 类（192~223）、D 类（组播）、E 类（保留）。\n"
            "子网划分：从主机号借用若干位作为子网号。子网掩码用于区分网络号和主机号。\n"
            "CIDR：无类别域间路由，用前缀长度表示（如 /24）。\n\n"
            "## 路由\n"
            "静态路由 vs 动态路由。路由算法：RIP（距离向量）、OSPF（链路状态）、BGP（路径向量）。\n"
            "ARP：IP 地址 → MAC 地址。ICMP：差错报告和询问。\n\n"
            "408 常考点：IP 地址分类和子网划分、CIDR 路由聚合、ARP 工作过程。"
        ),
        "tags": ["408", "计算机网络", "IP", "路由", "网络层"],
    },
    {
        "title": "408 计算机网络：数据链路层",
        "content": (
            "## 数据链路层\n"
            "功能：成帧、透明传输、差错控制、流量控制。\n"
            "透明传输方法：字符填充、比特填充（零比特填充法）。\n"
            "差错控制：CRC 循环冗余检验，只能检错不能纠错。\n"
            "流量控制：停止-等待协议、后退 N 帧协议（GBN）、选择重传协议（SR）。\n\n"
            "CSMA/CD：载波监听多点接入/碰撞检测，用于以太网。最小帧长 = 2 × 传播时延 × 数据传输率。\n"
            "CSMA/CA：碰撞避免，用于无线局域网 802.11。\n\n"
            "408 常考点：滑动窗口协议的窗口大小关系、CRC 计算、以太网帧格式。"
        ),
        "tags": ["408", "计算机网络", "数据链路层", "以太网", "CSMA"],
    },
    {
        "title": "408 计算机网络：应用层",
        "content": (
            "## 应用层\n"
            "DNS：域名系统，将域名解析为 IP 地址。递归查询和迭代查询。\n"
            "HTTP：超文本传输协议，基于 TCP，端口 80。请求方法 GET/POST/PUT/DELETE。\n"
            "HTTPS = HTTP + SSL/TLS，端口 443，提供加密和身份认证。\n"
            "SMTP/POP3/IMAP：电子邮件相关协议。\n"
            "DHCP：动态主机配置协议，自动分配 IP 地址。\n\n"
            "408 常考点：DNS 解析过程、HTTP 请求/响应报文格式、Cookie 和 Session 的区别。"
        ),
        "tags": ["408", "计算机网络", "应用层", "DNS", "HTTP"],
    },
]

@dataclass
class KnowledgeChunk:
    document_id: str
    title: str
    content: str
    tags: list[str]
    score: float = 0.0
    retrieval_mode: str = "lexical"
    source_path: str = ""
    course: str = ""
    type: str = ""
    file_ext: str = ""

    def to_context(self) -> str:
        tag_text = f" 标签：{', '.join(self.tags)}" if self.tags else ""
        course_text = f"\n课程：{self.course}" if self.course else ""
        type_text = f"\n类型：{self.type}" if self.type else ""
        return f"### {self.title}{tag_text}{course_text}{type_text}\n{self.content}"


class RAGPipeline:
    """Knowledge retrieval with pgvector similarity search, reranking, and web augmentation."""

    _reranker: Any = None
    _web_search: Any = None

    def __init__(self, config: dict[str, Any] | None = None):
        self.config = config or {}
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        self._ensure_seeded_sync()
        self._reranker_initialized = False
        self._web_search_initialized = False

    async def ingest(self, documents: list[str]) -> None:
        for index, content in enumerate(documents, start=1):
            await self.add_document(
                title=f"导入文档 {index}",
                content=content,
                tags=["imported"],
                source="api",
            )

    async def query(self, question: str, k: int = 5) -> list[str]:
        return [chunk.to_context() for chunk in await self.search(question, k=k)]

    async def list_documents(self) -> list[dict[str, Any]]:
        vector_docs = await self._list_vector_documents()
        if vector_docs:
            return vector_docs
        return [
            {
                "id": doc["id"],
                "title": doc["title"],
                "tags": self._clean_tags(doc.get("tags", [])),
                "source": doc.get("source", "manual"),
                "source_path": self._metadata_from_doc(doc).get("source_path", ""),
                "course": self._metadata_from_doc(doc).get("course", ""),
                "type": self._metadata_from_doc(doc).get("type", ""),
                "file_ext": self._metadata_from_doc(doc).get("file_ext", ""),
                "created_at": doc["created_at"],
                "chunk_count": len(self._chunk_content(doc.get("content", ""))),
            }
            for doc in self._read_docs()
        ]

    async def add_document(
        self,
        title: str,
        content: str,
        tags: list[str] | None = None,
        source: str = "manual",
        metadata: dict[str, Any] | None = None,
        index_vector: bool = True,
    ) -> dict[str, Any]:
        docs = self._read_docs()
        metadata = metadata or {}
        merged_tags = self._with_metadata_tags(tags or [], metadata)
        doc = {
            "id": str(uuid.uuid4()),
            "title": title.strip() or "未命名知识文档",
            "content": content.strip(),
            "tags": merged_tags,
            "source": source,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "source_path": str(metadata.get("source_path", "")),
            "course": str(metadata.get("course", "")),
            "type": str(metadata.get("type", "")),
            "file_ext": str(metadata.get("file_ext", "")),
        }
        docs.append(doc)
        self._write_docs(docs)
        if index_vector:
            await self._upsert_vector_document(doc)
        return doc

    async def search(self, query: str, k: int = 5) -> list[KnowledgeChunk]:
        """Retrieve knowledge chunks with vector/lexical search → rerank → return top-k.

        Pipeline: over-fetch → (optional) rerank → truncate to k.
        If local knowledge is insufficient (< 2 results), augments with web search.
        """
        # 1. Determine over-fetch count from config
        overfetch_factor = self._get_reranker_overfetch()
        fetch_k = k * overfetch_factor

        # 2. Retrieve candidates (vector → lexical fallback)
        if os.getenv("ZHIPATH_RAG_DISABLE_VECTOR", os.getenv("LEARNFLOW_RAG_DISABLE_VECTOR")) == "1":
            candidates = self._search_lexical(query, k=fetch_k)
        else:
            candidates = await self._search_vector(query, k=fetch_k)
            if not candidates:
                candidates = self._search_lexical(query, k=fetch_k)

        # 3. Web search augmentation if local results are sparse
        if len(candidates) < 2:
            web_chunks = await self._augment_with_web_search(query, k - len(candidates))
            candidates.extend(web_chunks)

        # 3.5. Intent-based boost:根据查询关键词调整结果优先级
        candidates = self._apply_intent_boost(query, candidates)

        # 4. Rerank if enough candidates and reranker is available
        if len(candidates) > k:
            reranker = self._get_reranker()
            if reranker is not None:
                try:
                    candidates = await reranker.rerank(query, candidates, top_k=k)
                except Exception as exc:
                    logger.warning("Reranking failed, using original ranking: %s", exc)
                    candidates = candidates[:k]

        return candidates[:k]

    def _get_reranker_overfetch(self) -> int:
        """Get over-fetch factor from config."""
        try:
            from config.loader import get_config

            cfg = get_config()
            return cfg.rag.reranker.overfetch_factor if cfg.rag.reranker.enabled else 1
        except Exception:
            return 3

    def _get_reranker(self):
        """Lazy-init reranker."""
        if self._reranker_initialized:
            return RAGPipeline._reranker
        self._reranker_initialized = True
        try:
            from services.rag.reranker import get_reranker

            RAGPipeline._reranker = get_reranker()
        except Exception as exc:
            logger.info("Reranker unavailable: %s", exc)
            RAGPipeline._reranker = None
        return RAGPipeline._reranker

    @staticmethod
    def _apply_intent_boost(query: str, candidates: list[KnowledgeChunk]) -> list[KnowledgeChunk]:
        """根据查询意图调整结果优先级。

        - 问"是什么/有哪些/区别/定义/概念" → 优先讲义 (lecture)
        - 问"推荐题/出题/练习/做题" → 优先习题 (quiz)
        - 问"代码/C语言/实现/编程" → 优先代码 (code)
        - 问"结构/关系/图谱/思维导图" → 优先知识结构 (mindmap)
        - 问"记忆/背诵/卡片/默写" → 优先记忆卡 (flashcard)
        """
        q = query.lower()
        type_boost: dict[str, float] = {}

        if any(kw in q for kw in ["是什么", "有哪些", "区别", "定义", "概念", "原理", "讲解"]):
            type_boost["lecture"] = 1.3
            type_boost["mindmap"] = 1.15
        elif any(kw in q for kw in ["推荐题", "出题", "练习", "做题", "真题", "考试"]):
            type_boost["quiz"] = 1.3
        elif any(kw in q for kw in ["代码", "c语言", "实现", "编程", "程序"]):
            type_boost["code"] = 1.3
        elif any(kw in q for kw in ["结构", "关系", "图谱", "思维导图", "知识图"]):
            type_boost["mindmap"] = 1.3
        elif any(kw in q for kw in ["记忆", "背诵", "卡片", "默写", "复习"]):
            type_boost["flashcard"] = 1.3

        if type_boost:
            for c in candidates:
                boost = type_boost.get(c.type, 1.0)
                if boost > 1.0:
                    c.score *= boost
            candidates.sort(key=lambda c: c.score, reverse=True)

        return candidates

    async def _augment_with_web_search(self, query: str, k: int = 3) -> list[KnowledgeChunk]:
        """Augment retrieval with web search results."""
        if not self._web_search_initialized:
            self._web_search_initialized = True
            try:
                from base.search_rag import get_search_manager

                RAGPipeline._web_search = get_search_manager()
            except Exception as exc:
                logger.info("Web search unavailable: %s", exc)
                return []

        if RAGPipeline._web_search is None:
            return []

        try:
            results = await RAGPipeline._web_search.retrieve(query, k=k)
            chunks: list[KnowledgeChunk] = []
            for r in results:
                chunks.append(
                    KnowledgeChunk(
                        document_id=f"web:{r.url[:50]}",
                        title=r.title,
                        content=r.snippet,
                        tags=["web-search"],
                        score=r.score,
                        retrieval_mode="web_search",
                    )
                )
            if chunks:
                logger.info("Web search augmented %d results for: %s", len(chunks), query[:80])
            return chunks
        except Exception as exc:
            logger.warning("Web search augmentation failed: %s", exc)
            return []

    def _search_lexical(self, query: str, k: int = 5) -> list[KnowledgeChunk]:
        query_terms = self._tokenize(query)
        if not query_terms:
            return []

        chunks: list[KnowledgeChunk] = []
        for doc in self._read_docs():
            metadata = self._metadata_from_doc(doc)
            tags = self._clean_tags(doc.get("tags", []))
            title = doc.get("title", "")
            searchable_tags = doc.get("tags", [])
            for chunk in self._chunk_content(doc.get("content", "")):
                chunk_terms = self._tokenize(" ".join([title, chunk, *tags]))
                chunk_terms |= self._tokenize(" ".join(str(t) for t in searchable_tags))
                score = self._score(query_terms, chunk_terms)
                score *= self._type_intent_boost(query, metadata.get("type", ""))
                if score > 0:
                    chunks.append(
                        KnowledgeChunk(
                            document_id=doc["id"],
                            title=title,
                            content=chunk,
                            tags=tags,
                            score=score,
                            retrieval_mode="lexical",
                            source_path=metadata.get("source_path", ""),
                            course=metadata.get("course", ""),
                            type=metadata.get("type", ""),
                            file_ext=metadata.get("file_ext", ""),
                        )
                    )

        chunks.sort(key=lambda item: item.score, reverse=True)
        return chunks[:k]

    # ---- 语义空间真投影 (768d → 2D PCA) ----
    # 缓存 PCA 参数, 保证 query 与文档用同一组主成分投影 (投影一致性)
    _semantic_cache: dict[str, Any] | None = None

    async def compute_semantic_map(self) -> dict[str, Any]:
        """768d embedding 真投影 2D 语义平面.

        - doc vector = chunk embedding 均值, l2 归一化
        - PCA: 中心化 → numpy SVD → 取前 2 主成分
        - 文档坐标 = 真实语义位置 (讲同一主题的文档自然聚簇)
        - 缓存 (mean, components, scale, doc_vectors) 供 project_query 用同一投影
        """
        import numpy as np

        try:
            ids_titles, vectors = await self._collect_doc_vectors()
        except Exception as exc:
            logger.info("Semantic map vector path unavailable, using JSON knowledge store: %s", exc)
            return self._compute_semantic_map_lexical()

        if len(vectors) < 3:
            return self._compute_semantic_map_lexical()

        X = np.array(vectors, dtype=np.float64)  # (n, d) 已归一化
        mean = X.mean(axis=0)
        Xc = X - mean
        # SVD PCA
        _, S, Vt = np.linalg.svd(Xc, full_matrices=False)
        components = Vt[:2]  # (2, d)
        coords = Xc @ components.T  # (n, 2)
        total_var = float((S ** 2).sum()) or 1.0
        explained = float((S[:2] ** 2).sum() / total_var)

        # 归一化到 [0.08, 0.92] (留边距)
        lo = coords.min(axis=0)
        hi = coords.max(axis=0)
        span = np.where((hi - lo) < 1e-9, 1.0, hi - lo)
        norm = (coords - lo) / span * 0.84 + 0.08

        # 真 cosine 相似度边 (top 阈值, 给前端画淡连线)
        sims = X @ X.T
        edges: list[dict[str, Any]] = []
        n = len(ids_titles)
        for i in range(n):
            for j in range(i + 1, n):
                s = float(sims[i, j])
                if s >= 0.62:
                    edges.append({
                        "source": ids_titles[i]["id"],
                        "target": ids_titles[j]["id"],
                        "similarity": round(s, 4),
                    })

        RAGPipeline._semantic_cache = {
            "mean": mean,
            "components": components,
            "lo": lo,
            "span": span,
            "doc_ids": [d["id"] for d in ids_titles],
            "doc_titles": [d["title"] for d in ids_titles],
            "doc_vectors": X,
        }

        nodes = [
            {
                **meta,
                "x": round(float(norm[i, 0]), 4),
                "y": round(float(norm[i, 1]), 4),
            }
            for i, meta in enumerate(ids_titles)
        ]
        return {
            "nodes": nodes,
            "edges": edges,
            "explained_variance": round(explained, 4),
            "embedding_dim": int(X.shape[1]),
            "retrieval": "pgvector-pca",
        }

    def _compute_semantic_map_lexical(self) -> dict[str, Any]:
        """Build a deterministic map from the real JSON knowledge store.

        This is intentionally not a demo dataset. It is used when pgvector/Postgres
        is unavailable, so the knowledge page can still show imported kb-final
        documents and chunk counts truthfully.
        """
        docs = self._read_docs()
        if not docs:
            return {"nodes": [], "edges": [], "explained_variance": 0.0, "embedding_dim": 0, "retrieval": "empty"}

        anchors = {
            "01-数据结构": (0.24, 0.28),
            "02-计算机组成原理": (0.76, 0.28),
            "03-操作系统": (0.24, 0.74),
            "04-计算机网络": (0.76, 0.74),
            "05-习题库": (0.50, 0.50),
            "07-实验案例": (0.50, 0.82),
        }
        fallback_anchor = (0.50, 0.50)
        by_course: dict[str, int] = {}
        token_sets: list[tuple[str, str, set[str]]] = []
        nodes: list[dict[str, Any]] = []

        for doc in docs:
            metadata = self._metadata_from_doc(doc)
            tags = self._clean_tags(doc.get("tags", []))
            course = metadata.get("course") or next((tag for tag in tags if tag.startswith(("01-", "02-", "03-", "04-", "05-", "07-"))), "408")
            index = by_course.get(course, 0)
            by_course[course] = index + 1
            ax, ay = anchors.get(course, fallback_anchor)
            angle = index * 2.399963229728653
            radius = min(0.18, 0.045 + 0.008 * math.sqrt(index + 1))
            x = max(0.05, min(0.95, ax + math.cos(angle) * radius))
            y = max(0.05, min(0.95, ay + math.sin(angle) * radius))
            doc_id = str(doc.get("id", ""))
            title = str(doc.get("title", "未命名知识片段"))
            tokens = self._tokenize(" ".join([title, *tags, str(doc.get("content", ""))[:600]]))
            token_sets.append((doc_id, course, tokens))
            nodes.append({
                "id": doc_id,
                "title": title,
                "tags": tags,
                "chunk_count": len(self._chunk_content(str(doc.get("content", "")))) or 1,
                "source": doc.get("source", "json"),
                "source_path": metadata.get("source_path", ""),
                "course": course,
                "type": metadata.get("type", ""),
                "file_ext": metadata.get("file_ext", ""),
                "x": round(x, 4),
                "y": round(y, 4),
            })

        edges: list[dict[str, Any]] = []
        grouped: dict[str, list[tuple[str, set[str]]]] = {}
        for doc_id, course, tokens in token_sets:
            grouped.setdefault(course, []).append((doc_id, tokens))
        for items in grouped.values():
            for i in range(len(items) - 1):
                a_id, a_tokens = items[i]
                b_id, b_tokens = items[i + 1]
                union = len(a_tokens | b_tokens) or 1
                sim = len(a_tokens & b_tokens) / union
                edges.append({"source": a_id, "target": b_id, "similarity": round(max(sim, 0.18), 4)})

        return {
            "nodes": nodes,
            "edges": edges[:1600],
            "explained_variance": 0.0,
            "embedding_dim": 0,
            "retrieval": "json-lexical",
        }

    async def project_query_semantic(self, query: str, k: int = 5) -> dict[str, Any]:
        """把 query embed 后用同一组 PCA 主成分投影到语义平面.

        返回 query 落点 + 真 cosine top-k. 落点必然靠近语义相关文档 — 可当场验证.
        """
        import numpy as np

        if RAGPipeline._semantic_cache is None:
            await self.compute_semantic_map()
        cache = RAGPipeline._semantic_cache
        if not cache:
            return {"x": 0.5, "y": 0.5, "topk": [], "note": "semantic map unavailable"}

        emb = await self._embed_query(query)
        if not emb:
            return {"x": 0.5, "y": 0.5, "topk": [], "note": "embed failed"}
        v = np.array(emb, dtype=np.float64)
        nrm = np.linalg.norm(v) or 1.0
        v = v / nrm

        p = (v - cache["mean"]) @ cache["components"].T  # (2,)
        norm_p = (p - cache["lo"]) / cache["span"] * 0.84 + 0.08
        # clamp — query 可能落在文档分布范围外
        x = float(np.clip(norm_p[0], 0.03, 0.97))
        y = float(np.clip(norm_p[1], 0.03, 0.97))

        sims = cache["doc_vectors"] @ v  # 真 cosine (全部已归一化)
        order = np.argsort(-sims)[: max(1, min(k, 10))]
        topk = [
            {
                "document_id": cache["doc_ids"][int(i)],
                "title": cache["doc_titles"][int(i)],
                "similarity": round(float(sims[int(i)]), 4),
            }
            for i in order
        ]
        return {"x": round(x, 4), "y": round(y, 4), "topk": topk}

    async def _collect_doc_vectors(self) -> tuple[list[dict[str, Any]], list[list[float]]]:
        """拉所有 doc 的 chunk-mean embedding (l2 归一化). 复用 topology 取数逻辑."""
        import math

        async with get_db() as db:
            stmt = (
                select(DocumentModel)
                .options(selectinload(DocumentModel.chunks))
                .order_by(DocumentModel.created_at.desc())
            )
            documents = (await db.execute(stmt)).scalars().all()

        metas: list[dict[str, Any]] = []
        vectors: list[list[float]] = []
        for doc in documents:
            chunk_vecs: list[list[float]] = []
            for ch in doc.chunks:
                emb = ch.embedding
                if emb is None:
                    continue
                try:
                    vec = [float(x) for x in emb]  # type: ignore[union-attr]
                except (TypeError, ValueError):
                    continue
                if vec:
                    chunk_vecs.append(vec)
            if not chunk_vecs:
                continue
            dim = len(chunk_vecs[0])
            mean = [0.0] * dim
            for v in chunk_vecs:
                for i in range(dim):
                    mean[i] += v[i]
            for i in range(dim):
                mean[i] /= len(chunk_vecs)
            norm = math.sqrt(sum(x * x for x in mean)) or 1.0
            vectors.append([x / norm for x in mean])
            metas.append({
                "id": doc.id,
                "title": doc.title,
                "tags": doc.tags or [],
                "chunk_count": len(doc.chunks),
            })
        return metas, vectors

    async def compute_topology(self) -> dict[str, Any]:
        """计算知识库拓扑: 文档节点 + 真 embedding 相似度边.

        策略:
        1. 拉所有 doc + 关联 chunks (含 embedding).
        2. 每个 doc 的 embedding = chunks embedding 平均 (l2-normalize).
        3. 算 doc 间 cosine 相似度矩阵.
        4. 保留 sim >= threshold 的边 (默认 0.55), 上限每节点 4 条最强边.
        无 DB / pgvector 时回退: 用文档标题 + tags lexical 共词数当近似相似度。
        """
        # 优先 pgvector
        try:
            return await self._compute_topology_vector()
        except Exception as exc:
            logger.info("Topology vector path unavailable, fallback to lexical: %s", exc)
            return self._compute_topology_lexical()

    async def _compute_topology_vector(self) -> dict[str, Any]:
        import math

        async with get_db() as db:
            stmt = (
                select(DocumentModel)
                .options(selectinload(DocumentModel.chunks))
                .order_by(DocumentModel.created_at.desc())
            )
            documents = (await db.execute(stmt)).scalars().all()

        nodes: list[dict[str, Any]] = []
        doc_vectors: list[tuple[str, list[float]]] = []
        for doc in documents:
            chunk_vecs: list[list[float]] = []
            for ch in doc.chunks:
                emb = ch.embedding
                if emb is None:
                    continue
                # pgvector 返回 numpy array / list, 用 float() 转换并捕获异常
                try:
                    vec = [float(x) for x in emb]  # type: ignore[union-attr]
                except (TypeError, ValueError):
                    continue
                if vec:
                    chunk_vecs.append(vec)
            if not chunk_vecs:
                continue
            dim = len(chunk_vecs[0])
            mean = [0.0] * dim
            for v in chunk_vecs:
                for i in range(dim):
                    mean[i] += v[i]
            for i in range(dim):
                mean[i] /= len(chunk_vecs)
            # l2 normalize
            norm = math.sqrt(sum(x * x for x in mean)) or 1.0
            mean = [x / norm for x in mean]
            doc_vectors.append((doc.id, mean))
            nodes.append({
                "id": doc.id,
                "title": doc.title,
                "tags": doc.tags or [],
                "chunk_count": len(doc.chunks),
                "source": doc.source,
            })

        edges: list[dict[str, Any]] = []
        per_node_keep = 4
        threshold = 0.55
        candidates: list[tuple[str, str, float]] = []
        for i in range(len(doc_vectors)):
            for j in range(i + 1, len(doc_vectors)):
                a_id, a = doc_vectors[i]
                b_id, b = doc_vectors[j]
                sim = sum(x * y for x, y in zip(a, b))
                if sim >= threshold:
                    candidates.append((a_id, b_id, sim))
        # 排序后按节点限流
        candidates.sort(key=lambda t: t[2], reverse=True)
        per_count: dict[str, int] = {}
        for a, b, sim in candidates:
            if per_count.get(a, 0) >= per_node_keep or per_count.get(b, 0) >= per_node_keep:
                continue
            edges.append({"source": a, "target": b, "similarity": round(sim, 4)})
            per_count[a] = per_count.get(a, 0) + 1
            per_count[b] = per_count.get(b, 0) + 1

        return {
            "nodes": nodes,
            "edges": edges,
            "embedding_dim": len(doc_vectors[0][1]) if doc_vectors else 0,
            "threshold": threshold,
            "retrieval": "pgvector",
        }

    def _compute_topology_lexical(self) -> dict[str, Any]:
        """无 embedding 时回退: 用 tag/title 共词比当近似相似度."""
        docs = self._read_docs()
        nodes: list[dict[str, Any]] = []
        token_sets: list[tuple[str, set[str]]] = []
        for doc in docs:
            tokens = set(self._tokenize(doc.get("title", "")))
            for t in doc.get("tags", []) or []:
                tokens.update(self._tokenize(str(t)))
            if not tokens:
                continue
            token_sets.append((doc["id"], tokens))
            nodes.append({
                "id": doc["id"],
                "title": doc["title"],
                "tags": doc.get("tags", []),
                "chunk_count": len(self._chunk_content(doc.get("content", ""))),
                "source": doc.get("source", "manual"),
            })

        edges: list[dict[str, Any]] = []
        for i in range(len(token_sets)):
            for j in range(i + 1, len(token_sets)):
                a_id, a = token_sets[i]
                b_id, b = token_sets[j]
                inter = len(a & b)
                union = len(a | b) or 1
                sim = inter / union  # Jaccard
                if sim >= 0.18:
                    edges.append({"source": a_id, "target": b_id, "similarity": round(sim, 4)})

        return {
            "nodes": nodes,
            "edges": edges,
            "embedding_dim": 0,
            "threshold": 0.18,
            "retrieval": "lexical",
        }

    async def _list_vector_documents(self) -> list[dict[str, Any]]:
        try:
            async with get_db() as db:
                stmt = (
                    select(DocumentModel)
                    .options(selectinload(DocumentModel.chunks))
                    .order_by(DocumentModel.created_at.desc())
                )
                result = await db.execute(stmt)
                documents = result.scalars().all()
                return [
                    {
                        "id": doc.id,
                        "title": doc.title,
                        "tags": self._clean_tags(doc.tags or []),
                        "source": doc.source,
                        "source_path": self._metadata_from_tags(doc.tags or []).get("source_path", ""),
                        "course": self._metadata_from_tags(doc.tags or []).get("course", ""),
                        "type": self._metadata_from_tags(doc.tags or []).get("type", ""),
                        "file_ext": self._metadata_from_tags(doc.tags or []).get("file_ext", ""),
                        "created_at": doc.created_at.isoformat(),
                        "chunk_count": len(doc.chunks),
                        "retrieval": "pgvector",
                    }
                    for doc in documents
                ]
        except Exception as exc:
            logger.info("Vector document listing unavailable, using JSON store: %s", exc)
            return []

    async def _search_vector(self, query: str, k: int = 5) -> list[KnowledgeChunk]:
        try:
            await self._ensure_vector_index()
            async with get_db() as db:
                chunk_count = await db.scalar(select(func.count(DocumentChunkModel.id)))
            if not chunk_count:
                return []

            query_embedding = await self._embed_query(query)
            if not query_embedding:
                return []

            distance = DocumentChunkModel.embedding.cosine_distance(query_embedding)
            stmt = (
                select(
                    DocumentChunkModel,
                    DocumentModel,
                    distance.label("distance"),
                )
                .join(DocumentModel, DocumentModel.id == DocumentChunkModel.document_id)
                .order_by(distance)
                .limit(max(1, min(k, 20)))
            )
            async with get_db() as db:
                rows = (await db.execute(stmt)).all()
            chunks: list[KnowledgeChunk] = []
            for chunk, doc, raw_distance in rows:
                distance_value = float(raw_distance or 0.0)
                metadata = self._metadata_from_tags(doc.tags or [])
                chunks.append(
                    KnowledgeChunk(
                        document_id=doc.id,
                        title=doc.title,
                        content=chunk.content,
                        tags=self._clean_tags(doc.tags or []),
                        score=max(0.0, 1.0 - distance_value),
                        retrieval_mode="pgvector",
                        source_path=metadata.get("source_path", ""),
                        course=metadata.get("course", ""),
                        type=metadata.get("type", ""),
                        file_ext=metadata.get("file_ext", ""),
                    )
                )
            return chunks
        except Exception as exc:
            logger.info("Vector search unavailable, falling back to lexical retrieval: %s", exc)
            return []

    async def _ensure_vector_index(self) -> None:
        docs = self._read_docs()
        if not docs:
            return
        try:
            async with get_db() as db:
                existing_count = await db.scalar(select(func.count(DocumentModel.id)))
        except Exception as exc:
            logger.info("Vector index check unavailable: %s", exc)
            return

        if existing_count:
            return

        for doc in docs:
            await self._upsert_vector_document(doc)

    async def _upsert_vector_document(self, doc: dict[str, Any]) -> None:
        content = str(doc.get("content", "")).strip()
        if not content:
            return
        try:
            chunks = self._chunk_content(content)
            async with get_db() as db:
                existing = await db.get(DocumentModel, doc["id"])
                if existing:
                    return

                embeddings = await self._embed_documents(chunks)
                if len(embeddings) != len(chunks):
                    return

                document = DocumentModel(
                    id=doc["id"],
                    title=doc.get("title", "未命名知识文档"),
                    content=content,
                    tags=doc.get("tags", []),
                    source=doc.get("source", "manual"),
                    created_at=_parse_datetime(doc.get("created_at")),
                )
                db.add(document)
                await db.flush()
                for index, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
                    db.add(
                        DocumentChunkModel(
                            document_id=document.id,
                            chunk_index=index,
                            content=chunk,
                            embedding=embedding,
                        )
                    )
                await db.commit()
        except Exception as exc:
            logger.info("Vector document indexing skipped for %s: %s", doc.get("title"), exc)

    @staticmethod
    async def _embed_documents(chunks: list[str]) -> list[list[float]]:
        if not chunks:
            return []
        embeddings = get_embeddings()
        return await asyncio.to_thread(embeddings.embed_documents, chunks)

    @staticmethod
    async def _embed_query(query: str) -> list[float]:
        embeddings = get_embeddings()
        return await asyncio.to_thread(embeddings.embed_query, query)

    async def build_context(self, query: str, k: int = 5, max_chars: int = 3000) -> str:
        parts: list[str] = []
        total = 0
        for chunk in await self.search(query, k=k):
            text = chunk.to_context()
            if total + len(text) > max_chars:
                break
            parts.append(text)
            total += len(text)
        return "\n\n".join(parts)

    async def build_cited_context(self, query: str, k: int = 5, max_chars: int = 3000):
        """带引用编号的上下文 + sources 元数据 + 低置信度标记。

        返回 services.guardrail.citation.CitedKnowledgeContext。
        延迟导入避免循环依赖。
        """
        from services.guardrail.citation import build_cited_context

        chunks = await self.search(query, k=k)
        return build_cited_context(chunks, max_chars=max_chars)

    def _ensure_seeded_sync(self) -> None:
        if DOCUMENTS_FILE.exists() and self._read_docs():
            return
        now = datetime.now(timezone.utc).isoformat()
        docs = [
            {
                "id": str(uuid.uuid4()),
                "title": doc["title"],
                "content": doc["content"],
                "tags": doc["tags"],
                "source": "seed",
                "created_at": now,
            }
            for doc in SEED_DOCUMENTS
        ]
        self._write_docs(docs)

    @staticmethod
    def _read_docs() -> list[dict[str, Any]]:
        if not DOCUMENTS_FILE.exists():
            return []
        try:
            data = json.loads(DOCUMENTS_FILE.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return []
        return data if isinstance(data, list) else []

    @staticmethod
    def _write_docs(docs: list[dict[str, Any]]) -> None:
        DOCUMENTS_FILE.write_text(
            json.dumps(docs, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    @staticmethod
    def _chunk_content(content: str, chunk_size: int = 1000, overlap: int = 150) -> list[str]:
        cleaned = re.sub(r"\s+", " ", content).strip()
        if not cleaned:
            return []
        if len(cleaned) <= chunk_size:
            return [cleaned]

        chunks: list[str] = []
        start = 0
        min_size = max(1, chunk_size - 200)
        max_size = chunk_size + 200
        overlap = max(0, min(overlap, chunk_size // 2))
        while start < len(cleaned):
            hard_end = min(start + max_size, len(cleaned))
            if hard_end == len(cleaned):
                end = hard_end
            else:
                soft_start = min(start + min_size, hard_end)
                window = cleaned[soft_start:hard_end]
                cut = max(
                    window.rfind("。"),
                    window.rfind("！"),
                    window.rfind("？"),
                    window.rfind(";"),
                    window.rfind(". "),
                    window.rfind(" "),
                )
                end = soft_start + cut + 1 if cut >= 0 else min(start + chunk_size, hard_end)
            chunk = cleaned[start:end].strip()
            if chunk:
                chunks.append(chunk)
            if end >= len(cleaned):
                break
            start = max(end - overlap, start + 1)
        return chunks

    @staticmethod
    def _with_metadata_tags(tags: list[str], metadata: dict[str, Any]) -> list[str]:
        cleaned = [str(tag).strip() for tag in tags if str(tag).strip()]
        for key in ("source_path", "course", "type", "file_ext"):
            value = str(metadata.get(key, "")).strip()
            if value:
                cleaned.append(f"meta:{key}={value}")
        return list(dict.fromkeys(cleaned))

    @staticmethod
    def _metadata_from_doc(doc: dict[str, Any]) -> dict[str, str]:
        metadata = RAGPipeline._metadata_from_tags(doc.get("tags", []))
        for key in ("source_path", "course", "type", "file_ext"):
            value = str(doc.get(key, "")).strip()
            if value:
                metadata[key] = value
        return metadata

    @staticmethod
    def _metadata_from_tags(tags: list[Any]) -> dict[str, str]:
        metadata: dict[str, str] = {}
        for tag in tags or []:
            text = str(tag)
            if not text.startswith("meta:") or "=" not in text:
                continue
            key, value = text[len("meta:") :].split("=", 1)
            if key in {"source_path", "course", "type", "file_ext"}:
                metadata[key] = value
        return metadata

    @staticmethod
    def _clean_tags(tags: list[Any]) -> list[str]:
        return [str(tag) for tag in tags or [] if not str(tag).startswith("meta:")]

    @staticmethod
    def _tokenize(text: str) -> set[str]:
        lowered = text.lower()
        words = set(re.findall(r"[a-z0-9_+#.-]{2,}", lowered))
        for segment in re.findall(r"[\u4e00-\u9fff]+", lowered):
            if len(segment) <= 2:
                words.add(segment)
            else:
                words.update(segment[i : i + 2] for i in range(len(segment) - 1))
                words.update(segment[i : i + 3] for i in range(len(segment) - 2))
        stopwords = {
            "什么",
            "么是",
            "是什",
            "什么是",
            "哪些",
            "有哪",
            "哪几",
            "几种",
            "推荐",
            "介绍",
            "解释",
            "一下",
        }
        return {word for word in words if word.strip() and word not in stopwords}

    @staticmethod
    def _score(query_terms: set[str], chunk_terms: set[str]) -> float:
        overlap = query_terms & chunk_terms
        if not overlap:
            return 0.0
        precision = len(overlap) / math.sqrt(max(len(chunk_terms), 1))
        recall = len(overlap) / max(len(query_terms), 1)
        return recall * 0.75 + precision * 0.25

    @staticmethod
    def _type_intent_boost(query: str, doc_type: str) -> float:
        if not doc_type:
            return 1.0
        asks_exercise = any(word in query for word in ("习题", "题目", "真题", "练习", "推荐"))
        asks_concept = any(word in query for word in ("什么", "哪些", "哪几种", "是什么", "解释", "介绍"))
        if asks_exercise and doc_type == "习题":
            return 1.35
        if asks_exercise and doc_type != "习题":
            return 0.65
        if asks_concept and doc_type == "讲义":
            return 1.6
        if asks_concept and doc_type == "习题":
            return 0.35
        return 1.0


def _parse_datetime(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value)
        except ValueError:
            pass
    return datetime.now(timezone.utc)
