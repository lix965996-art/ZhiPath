"""Settings API — 前端可视化配置 API Key（简化版）。

提供端点：
- GET  /api/v1/settings/status  检查配置状态
"""
from __future__ import annotations

from fastapi import APIRouter

from base.credential_context import get_configs, get_tts_creds

router = APIRouter(prefix="/api/v1/settings", tags=["settings"])


@router.get("/status")
async def get_status():
    """返回当前请求的配置状态概要。"""
    configs = get_configs()
    tts = get_tts_creds()

    enabled_configs = [c for c in configs if c.enabled and c.api_key]
    all_task_types = set()
    for c in enabled_configs:
        all_task_types.update(c.task_types)

    return {
        "config_count": len(enabled_configs),
        "tts_configured": bool(tts.get("XF_TTS_APPID") and tts.get("XF_TTS_API_KEY") and tts.get("XF_TTS_API_SECRET")),
        "covered_tasks": sorted(all_task_types),
        "note": "API 配置通过浏览器 localStorage 存储，请求时通过 header 临时传给后端。",
    }
