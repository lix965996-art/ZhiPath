"""A/B 实验框架 REST API。"""
from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from services.experiments import get_experiment_registry

router = APIRouter(prefix="/api/v1/experiments", tags=["experiments"])


class ObservationRequest(BaseModel):
    exp_name: str
    variant_id: str
    session_id: str
    duration_ms: float
    success: bool
    metric_score: float | None = None


@router.get("")
async def list_experiments():
    return get_experiment_registry().list_experiments()


@router.get("/{exp_name}/results")
async def get_results(exp_name: str):
    return get_experiment_registry().get_results(exp_name)


@router.post("/observe")
async def add_observation(req: ObservationRequest):
    get_experiment_registry().log_observation(
        exp_name=req.exp_name,
        variant_id=req.variant_id,
        session_id=req.session_id,
        duration_ms=req.duration_ms,
        success=req.success,
        metric_score=req.metric_score,
    )
    return {"status": "ok"}
