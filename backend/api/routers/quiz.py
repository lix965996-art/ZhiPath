from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

from services.quiz.feedback_service import QuizFeedbackService
from services.quiz.quiz_store import QuizStore

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/quiz", tags=["quiz"])
quiz_store = QuizStore()
feedback_service = QuizFeedbackService()


class QuizSubmitRequest(BaseModel):
    session_id: str
    answers: list[dict[str, Any]]  # [{question_index: int, answer: int|str|bool}]


@router.post("/submit")
async def submit_quiz(req: QuizSubmitRequest) -> dict[str, Any]:
    """Submit quiz answers, evaluate, and potentially trigger adaptive re-analysis."""
    quiz_data = await quiz_store.get_latest_quiz(req.session_id)
    if not quiz_data:
        return {"error": "未找到测验数据，请先生成测验。"}

    result = await feedback_service.evaluate_and_update(
        session_id=req.session_id,
        answers=req.answers,
        quiz_data=quiz_data,
    )
    return result


@router.get("/{session_id}/latest")
async def get_latest_quiz(session_id: str) -> dict[str, Any] | None:
    """Get the latest quiz data for a session."""
    return await quiz_store.get_latest_quiz(session_id)
