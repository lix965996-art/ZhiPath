"""FSRS-4 间隔重复算法（Free Spaced Repetition Scheduler v4）的简化实现。

参考：Ye et al. *Optimizing Spaced Repetition Schedule by Capturing the Dynamics of Memory*（2023）
和 open-spaced-repetition/fsrs4anki 项目。

在 ZhiPath 中的作用：
- 学生每做一次 Quiz / Exam，错题或被标记的 Flashcard 自动入"复习卡片"队列。
- 系统根据 FSRS 计算下次复习时间，"个性化学习路径"中加入"该 X 张卡片今天该复习"提示。
- 前端"复习日历"按 due_date 把卡片摊到时间轴，体现真实"因材施教"。

FSRS 比传统 SM-2 更准确：用 D (难度) / S (稳定性) / R (可提取性) 三个隐变量建模记忆。
我们采用 17 参数默认值（FSRS-4 论文表 3 的优化值），免训练即可用。
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from enum import IntEnum
from typing import Any


class Rating(IntEnum):
    """复习时的评级：FSRS 4 档评分（与 Anki 兼容）。"""

    AGAIN = 1   # 完全忘记
    HARD = 2    # 想起来但费力
    GOOD = 3    # 正常想起
    EASY = 4    # 轻松


# 来自 FSRS-4 论文优化值（17 个全局参数）
DEFAULT_PARAMS: tuple[float, ...] = (
    0.40, 0.60, 2.40, 5.80, 4.93, 0.94, 0.86, 0.01,
    1.49, 0.14, 0.94, 2.18, 0.05, 0.34, 1.26, 0.29, 2.61,
)

REQUEST_RETENTION = 0.9  # 目标可提取性（"我希望 90% 概率能想起来"）
MAXIMUM_INTERVAL = 365 * 5  # 上限 5 年


@dataclass
class FSRSCard:
    """一张待复习的"知识卡片"（可以是一道错题、一个 Flashcard、一个知识点）。"""

    card_id: str
    topic: str = ""
    front: str = ""  # 题面 / 知识点提问
    back: str = ""   # 答案 / 解释
    stability: float = 0.0
    difficulty: float = 0.0
    elapsed_days: float = 0.0
    scheduled_days: float = 0.0
    reps: int = 0
    lapses: int = 0
    state: str = "new"  # new / learning / review / relearning
    last_review: str | None = None
    due: str = ""  # ISO datetime
    review_history: list[dict[str, Any]] = field(default_factory=list)
    source: str = ""  # quiz / flashcard / manual / auto_tutor
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "card_id": self.card_id,
            "topic": self.topic,
            "front": self.front,
            "back": self.back,
            "stability": round(self.stability, 4),
            "difficulty": round(self.difficulty, 4),
            "elapsed_days": round(self.elapsed_days, 4),
            "scheduled_days": round(self.scheduled_days, 4),
            "reps": self.reps,
            "lapses": self.lapses,
            "state": self.state,
            "last_review": self.last_review,
            "due": self.due,
            "review_history": list(self.review_history),
            "source": self.source,
            "metadata": dict(self.metadata),
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "FSRSCard":
        return cls(
            card_id=str(data.get("card_id", "")),
            topic=str(data.get("topic", "")),
            front=str(data.get("front", "")),
            back=str(data.get("back", "")),
            stability=float(data.get("stability", 0.0)),
            difficulty=float(data.get("difficulty", 0.0)),
            elapsed_days=float(data.get("elapsed_days", 0.0)),
            scheduled_days=float(data.get("scheduled_days", 0.0)),
            reps=int(data.get("reps", 0)),
            lapses=int(data.get("lapses", 0)),
            state=str(data.get("state", "new")),
            last_review=data.get("last_review"),
            due=str(data.get("due", "")),
            review_history=list(data.get("review_history", [])),
            source=str(data.get("source", "")),
            metadata=dict(data.get("metadata", {})),
        )


class FSRSScheduler:
    """无状态调度器：传入 card + rating → 算出新 card 状态。"""

    def __init__(self, params: tuple[float, ...] = DEFAULT_PARAMS) -> None:
        self.w = params

    def review(self, card: FSRSCard, rating: Rating, now: datetime | None = None) -> FSRSCard:
        now = now or datetime.now(timezone.utc)
        last = self._parse_dt(card.last_review)
        if last is not None:
            card.elapsed_days = max(0.0, (now - last).total_seconds() / 86400.0)
        else:
            card.elapsed_days = 0.0

        if card.state == "new":
            new_difficulty = self._init_difficulty(rating)
            new_stability = self._init_stability(rating)
            new_state = "learning" if rating != Rating.EASY else "review"
        else:
            retrievability = self._forgetting_curve(card.elapsed_days, card.stability)
            new_difficulty = self._next_difficulty(card.difficulty, rating)
            if rating == Rating.AGAIN:
                new_stability = self._next_forget_stability(
                    card.difficulty, card.stability, retrievability,
                )
                new_state = "relearning"
                card.lapses += 1
            else:
                new_stability = self._next_recall_stability(
                    card.difficulty, card.stability, retrievability, rating,
                )
                new_state = "review"

        interval = self._next_interval(new_stability)
        due = now + timedelta(days=interval)

        card.reps += 1
        card.stability = new_stability
        card.difficulty = new_difficulty
        card.scheduled_days = interval
        card.state = new_state
        card.last_review = now.isoformat()
        card.due = due.isoformat()
        card.review_history.append({
            "rating": int(rating),
            "time": now.isoformat(),
            "stability": round(new_stability, 4),
            "difficulty": round(new_difficulty, 4),
            "interval_days": round(interval, 2),
        })
        return card

    # --- 公式实现（FSRS-4） ---

    def _init_difficulty(self, rating: Rating) -> float:
        d = self.w[4] - (rating - 3) * self.w[5]
        return self._clamp(d, 1.0, 10.0)

    def _init_stability(self, rating: Rating) -> float:
        return max(0.1, self.w[rating - 1])

    def _next_difficulty(self, d: float, rating: Rating) -> float:
        nd = d - self.w[6] * (rating - 3)
        # 向 w[4] 回归
        nd = self.w[5] * self.w[4] + (1 - self.w[5]) * nd
        return self._clamp(nd, 1.0, 10.0)

    def _next_recall_stability(
        self,
        d: float,
        s: float,
        r: float,
        rating: Rating,
    ) -> float:
        hard_penalty = self.w[15] if rating == Rating.HARD else 1.0
        easy_bonus = self.w[16] if rating == Rating.EASY else 1.0
        growth = (
            math.exp(self.w[8])
            * (11 - d)
            * math.pow(max(s, 0.01), -self.w[9])
            * (math.exp((1 - r) * self.w[10]) - 1)
            * hard_penalty
            * easy_bonus
        )
        return max(0.1, s * (1 + growth))

    def _next_forget_stability(self, d: float, s: float, r: float) -> float:
        return max(
            0.1,
            self.w[11]
            * math.pow(d, -self.w[12])
            * (math.pow(max(s, 0.01) + 1, self.w[13]) - 1)
            * math.exp((1 - r) * self.w[14]),
        )

    def _forgetting_curve(self, elapsed_days: float, stability: float) -> float:
        if stability <= 0:
            return 1.0
        return math.pow(1 + elapsed_days / (9 * stability), -1)

    def _next_interval(self, stability: float) -> float:
        interval = stability * 9 * (1.0 / REQUEST_RETENTION - 1)
        return min(MAXIMUM_INTERVAL, max(1, round(interval)))

    @staticmethod
    def _clamp(v: float, lo: float, hi: float) -> float:
        return max(lo, min(hi, v))

    @staticmethod
    def _parse_dt(text: str | None) -> datetime | None:
        if not text:
            return None
        try:
            return datetime.fromisoformat(text)
        except ValueError:
            return None
