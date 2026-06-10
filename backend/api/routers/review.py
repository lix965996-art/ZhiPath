"""FSRS 间隔重复 + BKT 知识追踪的对外接口。

设计原则：把"学习管理系统级别"的能力暴露给前端，让学习仪表盘可以一页讲完
学情。所有接口都按 session 隔离，不依赖外部账号体系。
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

from services.mastery import (
    DKTService,
    IRTItem,
    MasteryStore,
    estimate_ability,
    mastery_to_theta,
    recommend_difficulty,
    select_next_item,
)
from services.srs import ReviewStore, extract_review_candidates_from_quiz

router = APIRouter(prefix="/api/v1", tags=["review"])
review_store = ReviewStore()
mastery_store = MasteryStore()
dkt_service = DKTService()


class AddCardsRequest(BaseModel):
    cards: list[dict[str, Any]]
    source: str = "manual"


class RatingRequest(BaseModel):
    rating: int  # 1..4 (FSRS Again/Hard/Good/Easy)


class ImportQuizRequest(BaseModel):
    quiz: dict[str, Any]
    wrong_indices: list[int] | None = None
    topic_hint: str = ""


@router.get("/review/{session_id}/due")
async def get_due_cards(session_id: str, limit: int = 30):
    return await review_store.query_due(session_id, limit=limit)


@router.get("/review/{session_id}/deck")
async def get_deck(session_id: str):
    return await review_store.get_deck(session_id)


@router.get("/review/{session_id}/calendar")
async def get_review_calendar(session_id: str, days: int = 14):
    return await review_store.get_calendar(session_id, days=days)


@router.post("/review/{session_id}/cards")
async def add_cards(session_id: str, req: AddCardsRequest):
    added = await review_store.add_cards(
        session_id,
        req.cards,
        source=req.source,
    )
    return {"added": len(added), "cards": added}


@router.post("/review/{session_id}/import_quiz")
async def import_quiz_to_review(session_id: str, req: ImportQuizRequest):
    candidates = extract_review_candidates_from_quiz(
        req.quiz,
        wrong_indices=req.wrong_indices,
        topic_hint=req.topic_hint,
    )
    added = await review_store.add_cards(session_id, candidates, source="quiz")
    return {"added": len(added), "cards": added}


@router.post("/review/{session_id}/cards/{card_id}/rate")
async def rate_card(session_id: str, card_id: str, req: RatingRequest):
    updated = await review_store.review_card(session_id, card_id, req.rating)
    if updated is None:
        return {"error": "card not found"}
    return updated


# --- Mastery (BKT) ---


class MasteryUpsertRequest(BaseModel):
    labels: list[str]


class MasteryObservationsRequest(BaseModel):
    observations: list[dict[str, Any]]  # [{label, correct}, ...]


@router.get("/mastery/{session_id}")
async def get_mastery(session_id: str):
    return await mastery_store.get_mastery(session_id)


@router.post("/mastery/{session_id}/kcs")
async def upsert_kcs(session_id: str, req: MasteryUpsertRequest):
    return await mastery_store.upsert_kcs(session_id, req.labels)


@router.post("/mastery/{session_id}/observe")
async def post_observations(session_id: str, req: MasteryObservationsRequest):
    return await mastery_store.update_observations(session_id, req.observations)


@router.get("/mastery/{session_id}/focus")
async def get_focus(session_id: str, threshold: float = 0.6, limit: int = 5):
    return await mastery_store.get_focus_kcs(session_id, threshold=threshold, limit=limit)


# --- DKT (Deep Knowledge Tracing) ---


class DKTFitRequest(BaseModel):
    observations: list[dict[str, Any]]


@router.post("/dkt/{session_id}/fit")
async def fit_dkt(session_id: str, req: DKTFitRequest):
    """训练一次 mini DKT 并返回下题概率预测。前端可对照 BKT 结果。"""
    return await dkt_service.fit_and_predict(session_id, req.observations)


@router.get("/dkt/{session_id}")
async def get_dkt(session_id: str):
    return await dkt_service.get_predictions(session_id)


# --- IRT (Item Response Theory) ---


@router.get("/irt/{session_id}/ability")
async def get_ability(session_id: str):
    snap = await mastery_store.get_mastery(session_id)
    theta = mastery_to_theta(snap.get("summary", {}).get("avg_mastery", 0.3))
    return {
        "theta": round(theta, 3),
        "difficulty_hint": recommend_difficulty(theta),
        "interpretation": {
            "very_easy": "新手期，应做最基础题",
            "easy": "入门期，做基础题",
            "medium": "巩固期，做中等题",
            "hard": "进阶期，做综合题",
            "very_hard": "精通期，做挑战题",
        }[recommend_difficulty(theta)],
    }


class IRTSelectRequest(BaseModel):
    items: list[dict[str, Any]]  # [{item_id, a, b}, ...]


@router.post("/irt/{session_id}/select_next")
async def irt_select_next(session_id: str, req: IRTSelectRequest):
    snap = await mastery_store.get_mastery(session_id)
    theta = mastery_to_theta(snap.get("summary", {}).get("avg_mastery", 0.3))
    candidates = [
        IRTItem(item_id=str(it.get("item_id", "")), a=float(it.get("a", 1.0)), b=float(it.get("b", 0.0)))
        for it in req.items
    ]
    chosen = select_next_item(theta, candidates)
    return {
        "theta": round(theta, 3),
        "chosen": (
            {"item_id": chosen.item_id, "a": chosen.a, "b": chosen.b}
            if chosen else None
        ),
    }
