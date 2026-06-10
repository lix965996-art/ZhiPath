"""FSRS 复习卡片持久化 + 调度查询。

设计原则：
- 数据：每个 session 一个 review_deck JSON 文件，存所有 FSRSCard。
- 调度：query_due(now) 返回 due <= now 的卡片，是"复习推送"的数据源。
- 写入：错题、闪卡、Auto-Tutor 自评未通过的知识点会自动入库。
"""
from __future__ import annotations

import json
import logging
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .fsrs import FSRSCard, FSRSScheduler, Rating

logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "srs"


class ReviewStore:
    """FSRS 卡片仓库（按 session 隔离，JSON 落盘）。"""

    def __init__(self) -> None:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        self.scheduler = FSRSScheduler()

    # --- CRUD ---

    async def add_cards(
        self,
        session_id: str,
        cards: list[dict[str, Any]],
        source: str = "manual",
    ) -> list[dict[str, Any]]:
        """批量入库；自动跳过已有相同 front 的卡片。"""
        existing = self._read_deck(session_id)
        existing_fronts = {c.get("front", "") for c in existing if c.get("front")}
        added: list[dict[str, Any]] = []
        now = datetime.now(timezone.utc).isoformat()

        for raw in cards:
            front = (raw.get("front") or "").strip()
            if not front or front in existing_fronts:
                continue
            card = FSRSCard(
                card_id=f"card_{uuid.uuid4().hex[:12]}",
                topic=str(raw.get("topic", ""))[:80],
                front=front[:600],
                back=str(raw.get("back", ""))[:1200],
                state="new",
                due=now,  # new 卡片立即可见
                source=source,
                metadata={k: v for k, v in raw.items() if k not in {"front", "back", "topic"}},
            )
            existing.append(card.to_dict())
            existing_fronts.add(front)
            added.append(card.to_dict())

        self._write_deck(session_id, existing)
        logger.info("FSRS: session %s + %d cards (source=%s)", session_id, len(added), source)
        return added

    async def review_card(
        self,
        session_id: str,
        card_id: str,
        rating: int,
    ) -> dict[str, Any] | None:
        """对一张卡片评级，更新 FSRS 状态。"""
        deck = self._read_deck(session_id)
        for idx, raw in enumerate(deck):
            if raw.get("card_id") == card_id:
                card = FSRSCard.from_dict(raw)
                updated = self.scheduler.review(card, Rating(int(rating)))
                deck[idx] = updated.to_dict()
                self._write_deck(session_id, deck)
                return deck[idx]
        return None

    async def get_deck(self, session_id: str) -> list[dict[str, Any]]:
        return self._read_deck(session_id)

    async def query_due(
        self,
        session_id: str,
        now: datetime | None = None,
        limit: int = 30,
    ) -> list[dict[str, Any]]:
        """返回 due <= now 的卡片，按 due 升序。"""
        now = now or datetime.now(timezone.utc)
        deck = self._read_deck(session_id)
        due_cards: list[tuple[datetime, dict[str, Any]]] = []
        for raw in deck:
            due_str = raw.get("due") or ""
            try:
                due = datetime.fromisoformat(due_str)
            except ValueError:
                due = now
            if due <= now:
                due_cards.append((due, raw))
        due_cards.sort(key=lambda x: x[0])
        return [c for _, c in due_cards[:limit]]

    async def get_calendar(
        self,
        session_id: str,
        days: int = 14,
    ) -> dict[str, Any]:
        """复习日历：未来 N 天每天到期数量，供前端日历组件渲染。"""
        deck = self._read_deck(session_id)
        bucket: dict[str, list[dict[str, Any]]] = {}
        now = datetime.now(timezone.utc)
        for raw in deck:
            due_str = raw.get("due") or now.isoformat()
            try:
                due = datetime.fromisoformat(due_str)
            except ValueError:
                due = now
            offset = (due.date() - now.date()).days
            if offset < -7 or offset > days:
                continue
            key = due.date().isoformat()
            bucket.setdefault(key, []).append({
                "card_id": raw.get("card_id"),
                "topic": raw.get("topic"),
                "front": raw.get("front"),
                "stability": raw.get("stability"),
                "difficulty": raw.get("difficulty"),
                "state": raw.get("state"),
            })
        return {
            "today": now.date().isoformat(),
            "buckets": bucket,
            "stats": self._compute_stats(deck),
        }

    @staticmethod
    def _compute_stats(deck: list[dict[str, Any]]) -> dict[str, Any]:
        if not deck:
            return {
                "total": 0,
                "new": 0,
                "learning": 0,
                "review": 0,
                "relearning": 0,
                "avg_stability": 0,
                "avg_difficulty": 0,
                "mature_count": 0,  # stability > 21 天视为"已巩固"
            }
        total = len(deck)
        counts: dict[str, int] = {}
        s_sum = d_sum = mature = 0.0
        for c in deck:
            counts[c.get("state", "new")] = counts.get(c.get("state", "new"), 0) + 1
            stability = float(c.get("stability", 0))
            difficulty = float(c.get("difficulty", 0))
            s_sum += stability
            d_sum += difficulty
            if stability >= 21:
                mature += 1
        return {
            "total": total,
            "new": counts.get("new", 0),
            "learning": counts.get("learning", 0),
            "review": counts.get("review", 0),
            "relearning": counts.get("relearning", 0),
            "avg_stability": round(s_sum / total, 2),
            "avg_difficulty": round(d_sum / total, 2),
            "mature_count": int(mature),
        }

    # --- file IO ---

    @staticmethod
    def _safe_id(session_id: str) -> str:
        return re.sub(r"[^a-zA-Z0-9_-]", "", session_id) or "default"

    def _deck_path(self, session_id: str) -> Path:
        return DATA_DIR / f"{self._safe_id(session_id)}.json"

    def _read_deck(self, session_id: str) -> list[dict[str, Any]]:
        path = self._deck_path(session_id)
        if not path.exists():
            return []
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return []
        return data if isinstance(data, list) else []

    def _write_deck(self, session_id: str, deck: list[dict[str, Any]]) -> None:
        self._deck_path(session_id).write_text(
            json.dumps(deck, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )


def extract_review_candidates_from_quiz(
    quiz: dict[str, Any],
    wrong_indices: list[int] | None = None,
    topic_hint: str = "",
) -> list[dict[str, Any]]:
    """从一份 Quiz 抽出错题/重点题作为复习卡片素材。"""
    cards: list[dict[str, Any]] = []
    if not isinstance(quiz, dict):
        return cards

    def add(front: str, back: str, qtype: str) -> None:
        if not front or not back:
            return
        cards.append({
            "topic": topic_hint or qtype,
            "front": front[:600],
            "back": back[:1200],
            "qtype": qtype,
        })

    for q in quiz.get("single_choice_questions", []) or []:
        opts = q.get("options") or []
        correct = q.get("correct_option")
        try:
            correct_text = opts[int(correct)] if isinstance(correct, (int, str)) and str(correct).isdigit() else str(correct)
        except (IndexError, ValueError):
            correct_text = str(correct)
        add(
            q.get("question", ""),
            f"答案：{correct_text}\n解析：{q.get('explanation', '')}",
            "single_choice",
        )
    for q in quiz.get("multiple_choice_questions", []) or []:
        add(
            q.get("question", ""),
            f"答案：{q.get('correct_options', [])}\n解析：{q.get('explanation', '')}",
            "multiple_choice",
        )
    for q in quiz.get("true_false_questions", []) or []:
        add(
            q.get("question", ""),
            f"答案：{q.get('correct_answer')}\n解析：{q.get('explanation', '')}",
            "true_false",
        )
    for q in quiz.get("short_answer_questions", []) or []:
        add(
            q.get("question", ""),
            f"参考答案：{q.get('expected_answer', '')}\n解析：{q.get('explanation', '')}",
            "short_answer",
        )

    if wrong_indices is not None:
        # 仅入错题
        return [cards[i] for i in wrong_indices if 0 <= i < len(cards)]
    return cards
