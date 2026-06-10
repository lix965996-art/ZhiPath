from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from services.profile import LearningProfileService

router = APIRouter(prefix="/api/v1/profile", tags=["profile"])
profile_service = LearningProfileService()


class UpdateProfileRequest(BaseModel):
    message: str
    capability: str = "chat"


@router.get("/{session_id}")
async def get_profile(session_id: str):
    return await profile_service.get_profile(session_id)


@router.get("/{session_id}/context")
async def get_profile_context(session_id: str):
    return {"context": await profile_service.build_context(session_id)}


@router.post("/{session_id}/extract")
async def extract_profile(session_id: str, req: UpdateProfileRequest):
    return await profile_service.update_from_user_message(
        session_id=session_id,
        message=req.message,
        capability=req.capability,
    )


@router.get("/{session_id}/evidence")
async def get_profile_evidence(session_id: str):
    """暴露画像证据链：每个画像维度对应的原话片段 + 第几轮抽出来的。"""
    profile = await profile_service.get_profile(session_id)
    return {
        "evidence_log": profile.get("evidence_log", []),
        "evidence_index": profile.get("evidence_index", {}),
        "dimension_coverage": profile.get("dimension_coverage", {}),
    }
