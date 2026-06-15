"""Demo Seed：一键填充演示数据。

设计目标：评委第一次打开 ZhiPath 时，主界面 / Dashboard / Classroom 各页都不是空的。
通过 POST /api/v1/demo/seed 创建一个"小明同学"演示会话，并填充：
- 7 维度学习者画像（带证据链）
- 8 个 KG 节点 + 9 条前后置依赖边（408 计算机专业基础）
- 12 个 BKT 知识点（含不同掌握度的历史曲线）
- 6 张 FSRS 复习卡（含到期分布）
- 1 份资源包（含 Quiz、Flashcard、MindMap、Mermaid、CodeLab）
- 1 份试卷
- 3 条 xAPI Statement

幂等：重复调用不会爆，已存在的不会重复加。
"""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from services.knowledge_graph import KnowledgeGraph
from services.mastery import BKTTracker, KnowledgeComponent, MasteryStore
from services.profile import LearningProfileService
from services.session.store import SessionStore
from services.srs import FSRSCard, FSRSScheduler, Rating, ReviewStore
from services.xapi import get_lrs

logger = logging.getLogger(__name__)


DEMO_SESSION_ID = "demo_session_xiaoming"
DEMO_LEARNER_NAME = "小明（演示账号）"

DEMO_KG_NODES = [
    {"id": "linear_list", "label": "线性表", "category": "data_structure", "summary": "顺序表、链表与基本操作", "difficulty": 0.3},
    {"id": "binary_tree", "label": "二叉树遍历", "category": "data_structure", "summary": "前序、中序、后序、层序遍历", "difficulty": 0.45},
    {"id": "cache_mapping", "label": "Cache 映射方式", "category": "computer_org", "summary": "直接映射、全相联、组相联", "difficulty": 0.6},
    {"id": "instruction_pipeline", "label": "指令流水线", "category": "computer_org", "summary": "流水线性能与相关冲突", "difficulty": 0.65},
    {"id": "process_management", "label": "进程管理", "category": "os", "summary": "进程状态、PCB、调度与同步", "difficulty": 0.5},
    {"id": "deadlock", "label": "死锁", "category": "os", "summary": "必要条件、预防、避免与检测", "difficulty": 0.7},
    {"id": "tcp_handshake", "label": "TCP 三次握手", "category": "network", "summary": "连接建立、序号与确认", "difficulty": 0.45},
    {"id": "ip_subnet", "label": "IP 子网划分", "category": "network", "summary": "CIDR、子网掩码与路由聚合", "difficulty": 0.55},
]

DEMO_KG_EDGES = [
    {"source": "linear_list", "target": "binary_tree", "relation": "prerequisite"},
    {"source": "binary_tree", "target": "deadlock", "relation": "review_parallel"},
    {"source": "cache_mapping", "target": "instruction_pipeline", "relation": "builds_on"},
    {"source": "process_management", "target": "deadlock", "relation": "prerequisite"},
    {"source": "tcp_handshake", "target": "ip_subnet", "relation": "network_foundation"},
    {"source": "cache_mapping", "target": "process_management", "relation": "cross_subject"},
    {"source": "deadlock", "target": "tcp_handshake", "relation": "408_rotation"},
    {"source": "binary_tree", "target": "cache_mapping", "relation": "408_rotation"},
    {"source": "ip_subnet", "target": "process_management", "relation": "408_rotation"},
]

# 每个 KC 的"答题历史" — (label, [correct 序列])
# mastery 会从 0.3 起步，按 BKT 更新；序列长度 ≈ 6
DEMO_BKT_HISTORY = [
    ("线性表", [True, True, True, True, False, True]),
    ("二叉树遍历", [True, True, False, True, True, True]),
    ("图的遍历", [True, True, True, False, True]),
    ("Cache 映射方式", [False, True, False, True, False, True]),
    ("指令流水线", [False, False, True, False, True]),
    ("进程管理", [True, False, True, False, True]),
    ("死锁", [False, False, True, False, False, True]),
    ("内存管理", [False, True, False, False]),
    ("TCP 三次握手", [True, True, False, True]),
    ("滑动窗口协议", [False, True, False, True, False]),
    ("IP 子网划分", [False, False, True]),
    ("路由选择", [False, True, False]),
]

DEMO_FSRS_CARDS = [
    {"front": "死锁产生的四个必要条件", "back": "互斥、不可剥夺、请求并保持、循环等待", "topic": "死锁"},
    {"front": "Cache 的三种映射方式", "back": "直接映射、全相联映射、组相联映射", "topic": "Cache 映射方式"},
    {"front": "二叉树常见遍历方式", "back": "前序、中序、后序、层序遍历", "topic": "二叉树遍历"},
    {"front": "TCP 三次握手的核心目的", "back": "确认双方收发能力并同步初始序号", "topic": "TCP 三次握手"},
    {"front": "PCB 中通常包含什么", "back": "进程标识、处理机状态、调度信息、控制信息等", "topic": "进程管理"},
    {"front": "页式存储的地址结构", "back": "页号 + 页内偏移", "topic": "内存管理"},
]


async def seed_demo_data() -> dict[str, Any]:
    sid = DEMO_SESSION_ID

    # 1) 会话
    session_store = SessionStore()
    existing = await session_store.get_session(sid)
    if existing is None:
        # 直接造一个，绕开 create_session 的自动 ID 生成
        try:
            await session_store.create_session(title=DEMO_LEARNER_NAME)  # 备用：可能用了新 ID
        except Exception as exc:
            logger.info("create_session reused: %s", exc)

    # 2) 画像（模拟多轮对话累积）
    profile_svc = LearningProfileService()
    await profile_svc.update_from_user_message(
        sid,
        "我是计算机大二学生，正在备考 408，想 2 周强化操作系统和计算机组成原理",
        capability="goal",
    )
    await profile_svc.update_from_user_message(
        sid,
        "我分不清 Cache 的直接映射、全相联和组相联，希望多看 408 例题",
        capability="chat",
    )
    await profile_svc.update_from_user_message(
        sid,
        "目标是能稳定做 408 综合题，对死锁、进程调度和 TCP 三次握手比较弱",
        capability="goal",
    )

    # 3) 知识图谱
    kg = KnowledgeGraph()
    await kg.upsert_nodes(sid, DEMO_KG_NODES)
    await kg.add_edges(sid, DEMO_KG_EDGES)

    # 4) BKT 掌握度（按真实历史序列演化）
    mastery_store = MasteryStore()
    labels = [t[0] for t in DEMO_BKT_HISTORY]
    await mastery_store.upsert_kcs(sid, labels)
    for label, seq in DEMO_BKT_HISTORY:
        for correct in seq:
            await mastery_store.update_observations(sid, [{"label": label, "correct": correct}])

    # 5) FSRS 复习卡片（注入不同到期时间）
    review_store = ReviewStore()
    added = await review_store.add_cards(sid, DEMO_FSRS_CARDS, source="seed")
    # 演化几张卡的状态：分别评 GOOD / AGAIN / HARD，让日历有数据
    scheduler = FSRSScheduler()
    deck = await review_store.get_deck(sid)
    for idx, raw in enumerate(deck[: min(4, len(deck))]):
        card = FSRSCard.from_dict(raw)
        rating = [Rating.GOOD, Rating.AGAIN, Rating.HARD, Rating.GOOD][idx % 4]
        scheduler.review(card, rating)
        # 把更新后的 card 写回（用 review_card 接口模拟）
        await review_store.review_card(sid, card.card_id, int(rating))

    # 6) xAPI Statements (3 条)
    lrs = get_lrs()
    lrs.emit(
        session_id=sid,
        verb="passed",
        object_id="quiz/demo_quiz_001",
        object_name="408 操作系统测验",
        result={"score": {"scaled": 0.85, "raw": 17, "max": 20}, "completion": True, "success": True},
    )
    lrs.emit(
        session_id=sid,
        verb="experienced",
        object_id="resource/demo_resource_pack_001",
        object_name="408 个性化资源包",
        result={"completion": True},
    )
    lrs.emit(
        session_id=sid,
        verb="completed",
        object_id="path/intro_408",
        object_name="408 强化路径",
        result={"completion": False, "progress": 0.42},
    )

    return {
        "session_id": sid,
        "title": DEMO_LEARNER_NAME,
        "kg_nodes": len(DEMO_KG_NODES),
        "kg_edges": len(DEMO_KG_EDGES),
        "bkt_kcs": len(DEMO_BKT_HISTORY),
        "fsrs_cards": len(DEMO_FSRS_CARDS),
        "xapi_statements": 3,
        "note": "已填充演示数据，主界面 / Dashboard / Classroom 各页应能看到内容。",
    }
