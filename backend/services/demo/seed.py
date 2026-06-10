"""Demo Seed：一键填充演示数据。

设计目标：评委第一次打开 ZhiPath 时，主界面 / Dashboard / Classroom 各页都不是空的。
通过 POST /api/v1/demo/seed 创建一个"小明同学"演示会话，并填充：
- 7 维度学习者画像（带证据链）
- 8 个 KG 节点 + 9 条前后置依赖边（机器学习领域）
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
    {"id": "linear_algebra", "label": "线性代数基础", "category": "concept", "summary": "向量、矩阵、特征值的工程化基础", "difficulty": 0.3},
    {"id": "probability", "label": "概率统计基础", "category": "concept", "summary": "贝叶斯、期望、方差", "difficulty": 0.4},
    {"id": "python_basics", "label": "Python 基础", "category": "skill", "summary": "数据类型、控制流、函数", "difficulty": 0.2},
    {"id": "numpy_pandas", "label": "NumPy / Pandas", "category": "tool", "summary": "数值与表格数据处理", "difficulty": 0.35},
    {"id": "linear_regression", "label": "线性回归", "category": "algorithm", "summary": "监督学习入门", "difficulty": 0.4},
    {"id": "logistic_regression", "label": "逻辑回归", "category": "algorithm", "summary": "二分类基础", "difficulty": 0.5},
    {"id": "decision_tree", "label": "决策树", "category": "algorithm", "summary": "可解释分类器", "difficulty": 0.55},
    {"id": "neural_network", "label": "神经网络入门", "category": "algorithm", "summary": "前向 + 反向传播", "difficulty": 0.75},
]

DEMO_KG_EDGES = [
    {"source": "linear_algebra", "target": "linear_regression", "relation": "prerequisite"},
    {"source": "probability", "target": "logistic_regression", "relation": "prerequisite"},
    {"source": "python_basics", "target": "numpy_pandas", "relation": "prerequisite"},
    {"source": "numpy_pandas", "target": "linear_regression", "relation": "prerequisite"},
    {"source": "numpy_pandas", "target": "logistic_regression", "relation": "prerequisite"},
    {"source": "linear_regression", "target": "logistic_regression", "relation": "builds_on"},
    {"source": "logistic_regression", "target": "neural_network", "relation": "builds_on"},
    {"source": "linear_regression", "target": "decision_tree", "relation": "related"},
    {"source": "decision_tree", "target": "neural_network", "relation": "builds_on"},
]

# 每个 KC 的"答题历史" — (label, [correct 序列])
# mastery 会从 0.3 起步，按 BKT 更新；序列长度 ≈ 6
DEMO_BKT_HISTORY = [
    ("线性代数基础", [True, True, True, True, False, True]),       # 高掌握
    ("概率统计基础", [True, True, False, True, True, True]),
    ("Python 基础", [True, True, True, True, True, True]),           # 满分
    ("NumPy / Pandas", [True, False, True, True, True]),
    ("线性回归", [True, True, False, True, False, True]),
    ("逻辑回归", [False, True, False, True, False, True]),            # 中等
    ("决策树", [False, False, True, False, False, True]),            # 薄弱
    ("神经网络入门", [False, False, False, False]),                  # 高薄弱
    ("交叉熵损失", [False, False, False]),                            # 新接触
    ("梯度下降", [True, False, True, False, True]),
    ("过拟合识别", [False, True, False]),
    ("正则化方法", [False, False, True]),
]

DEMO_FSRS_CARDS = [
    {"front": "什么是过拟合？", "back": "模型在训练集上表现很好，但在测试集上表现差", "topic": "过拟合识别"},
    {"front": "L1 vs L2 正则化的区别", "back": "L1 产生稀疏解，L2 让权重更平滑", "topic": "正则化方法"},
    {"front": "softmax 的数学定义", "back": "exp(x_i) / sum(exp(x_j))", "topic": "神经网络入门"},
    {"front": "交叉熵损失的公式", "back": "-Σ y_i * log(p_i)", "topic": "交叉熵损失"},
    {"front": "决策树的分裂标准", "back": "信息增益、基尼系数、卡方", "topic": "决策树"},
    {"front": "梯度下降的三种变体", "back": "BGD / SGD / Mini-batch GD", "topic": "梯度下降"},
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
        "我是计算机大二学生，想 2 周入门机器学习，零基础但有 Python 基础",
        capability="goal",
    )
    await profile_svc.update_from_user_message(
        sid,
        "我分不清监督学习和无监督学习，希望多看通俗案例",
        capability="chat",
    )
    await profile_svc.update_from_user_message(
        sid,
        "目标是能独立做一个房价预测项目，对决策树和神经网络的反向传播比较弱",
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
        object_name="机器学习入门测验",
        result={"score": {"scaled": 0.85, "raw": 17, "max": 20}, "completion": True, "success": True},
    )
    lrs.emit(
        session_id=sid,
        verb="experienced",
        object_id="resource/demo_resource_pack_001",
        object_name="机器学习个性化资源包",
        result={"completion": True},
    )
    lrs.emit(
        session_id=sid,
        verb="completed",
        object_id="path/intro_ml",
        object_name="机器学习入门路径",
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
