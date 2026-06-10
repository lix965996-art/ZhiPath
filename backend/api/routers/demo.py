"""Demo seed REST API。

POST /api/v1/demo/seed → 一键填充演示数据（幂等）
GET  /api/v1/demo/info → 演示账号信息
"""
from __future__ import annotations

from fastapi import APIRouter

from services.demo import DEMO_SESSION_ID, seed_demo_data

router = APIRouter(prefix="/api/v1/demo", tags=["demo"])


@router.post("/seed")
async def post_seed():
    return await seed_demo_data()


@router.get("/info")
async def get_info():
    return {
        "demo_session_id": DEMO_SESSION_ID,
        "title": "小明（演示账号）",
        "instructions": [
            "1. POST /api/v1/demo/seed 触发一键填充",
            "2. 前端 chat 页面可在会话切换中选 'demo_session_xiaoming'",
            "3. /dashboard、/classroom 等聚合页都会显示已填充的真实数据",
        ],
    }
