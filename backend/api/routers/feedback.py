"""RLHF 学生反馈环：每条助手消息可被 👍/👎 评分。

写入 A/B 实验框架 → 用于校准下一次 prompt variant 选择。
形成"学生 → AI 校准 → 下次更好"的闭环，这是当代大模型产品的标配。
"""
from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from services.experiments import get_experiment_registry
from services.xapi import get_lrs

router = APIRouter(prefix="/api/v1/feedback", tags=["feedback"])


class MessageFeedbackRequest(BaseModel):
    session_id: str
    turn_id: str
    rating: int  # -1 = 👎, 0 = 中性, +1 = 👍
    comment: str = ""
    capability: str = "chat"
    variant_id: str | None = None
    duration_ms: float = 0


@router.post("/message")
async def submit_message_feedback(req: MessageFeedbackRequest):
    """学生对一条 assistant 消息打分。"""
    # 写入 A/B 实验聚合（如果有 variant_id）
    if req.variant_id:
        get_experiment_registry().log_observation(
            exp_name=f"{req.capability}_system_prompt",
            variant_id=req.variant_id,
            session_id=req.session_id,
            duration_ms=req.duration_ms,
            success=req.rating >= 0,
            metric_score=(req.rating + 1) / 2.0,  # 映射到 [0,1]
        )
    # 写入 xAPI Statement
    get_lrs().emit(
        session_id=req.session_id,
        verb="interacted",
        object_id=f"assistant_message/{req.turn_id}",
        object_name="助手回复",
        result={
            "score": {"scaled": (req.rating + 1) / 2.0, "raw": req.rating},
            "response": req.comment or ("like" if req.rating > 0 else "dislike" if req.rating < 0 else "neutral"),
        },
        context={
            "extensions": {
                "https://zhipath.local/x/capability": req.capability,
                "https://zhipath.local/x/variant_id": req.variant_id,
            },
        },
    )
    return {"status": "ok"}
