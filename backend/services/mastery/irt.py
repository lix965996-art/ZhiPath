"""Item Response Theory (IRT) — 2PL 模型，自适应题目难度。

参考：Lord & Novick (1968). *Statistical Theories of Mental Test Scores*.

2PL 模型：
    P(answer correct | ability θ, item) = 1 / (1 + exp(-a * (θ - b)))
其中：
- θ : 学生能力（潜在变量）
- a : 题目区分度（越大该题对 ability 越敏感）
- b : 题目难度

在 ZhiPath 中：
- 用 BKT 的 mastery 当 ability 初值
- 出题 Agent 根据 ability 选"最大信息量"的下一道题难度 b ≈ θ
- 完成测验后 MLE 更新 ability

数学：item information I(θ) = a² * P(θ) * (1 - P(θ))，
在 P=0.5 时（即 θ ≈ b）达到最大值。
"""
from __future__ import annotations

import math
from dataclasses import dataclass


@dataclass
class IRTItem:
    item_id: str
    a: float = 1.0   # discrimination
    b: float = 0.0   # difficulty


def prob_correct(theta: float, item: IRTItem) -> float:
    return 1.0 / (1.0 + math.exp(-item.a * (theta - item.b)))


def item_information(theta: float, item: IRTItem) -> float:
    p = prob_correct(theta, item)
    return (item.a ** 2) * p * (1 - p)


def estimate_ability(
    responses: list[tuple[IRTItem, int]],
    prior: float = 0.0,
    iters: int = 30,
    lr: float = 0.4,
) -> float:
    """牛顿法估计 ability θ。

    responses: [(item, 0|1), ...]
    """
    theta = prior
    if not responses:
        return theta
    for _ in range(iters):
        grad = 0.0
        info = 0.0
        for item, y in responses:
            p = prob_correct(theta, item)
            grad += item.a * (y - p)
            info += item_information(theta, item)
        if info <= 1e-6:
            break
        delta = grad / info
        theta += lr * delta
        if abs(delta) < 1e-3:
            break
    return max(-4.0, min(4.0, theta))


def select_next_item(
    theta: float,
    candidates: list[IRTItem],
) -> IRTItem | None:
    """挑选当前 ability 下信息量最大的题目（CAT 经典策略）。"""
    if not candidates:
        return None
    return max(candidates, key=lambda it: item_information(theta, it))


def recommend_difficulty(theta: float) -> str:
    """给出文字版的难度建议，供资源生成 prompt 使用。"""
    if theta < -1.5:
        return "very_easy"
    if theta < -0.3:
        return "easy"
    if theta < 0.6:
        return "medium"
    if theta < 1.5:
        return "hard"
    return "very_hard"


def mastery_to_theta(mastery: float) -> float:
    """把 BKT mastery (0-1) 线性映射到 IRT ability (-2.5 ~ 2.5)。"""
    return (max(0.0, min(1.0, mastery)) - 0.5) * 5.0
