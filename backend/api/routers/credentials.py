"""凭据状态与测试 API。

设计原则：
- **永不返回**用户的 Key 本体（只返回是否存在 + 来源）
- POST /test 用最小代价测试某个 Key 是否真的可用（不消耗大量 token）
- POST /fetch-models 根据 API Key + Base URL 动态拉取可用模型列表

返回值示例：
{
    "DEEPSEEK_API_KEY":    {"source": "browser", "available": true},
    "DASHSCOPE_API_KEY":   {"source": "env", "available": true},
    "XF_SPARK_API_PASSWORD":{"source": "missing", "available": false},
    ...
}
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any

import httpx
from fastapi import APIRouter
from pydantic import BaseModel

from base.credential_context import SUPPORTED_KEYS, credential_source, get_credential

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/credentials", tags=["credentials"])


# 给前端友好显示的名字
KEY_LABELS = {
    "DEEPSEEK_API_KEY": "DeepSeek API Key",
    "DASHSCOPE_API_KEY": "通义千问 (DashScope) API Key",
    "SILICONFLOW_API_KEY": "硅基流动 (SiliconFlow) API Key",
    "XF_SPARK_API_PASSWORD": "讯飞星火 (OpenAI 兼容) API Password",
    "OPENAI_COMPAT_API_KEY": "OpenAI 兼容 API Key",
    "ANTHROPIC_COMPAT_API_KEY": "Anthropic API Key",
    "XF_TTS_APPID": "讯飞 TTS APPID",
    "XF_TTS_API_KEY": "讯飞 TTS APIKey",
    "XF_TTS_API_SECRET": "讯飞 TTS APISecret",
}


# 凭据所属"分组"，前端可分区展示
KEY_GROUPS = {
    "DEEPSEEK_API_KEY": "LLM 模型",
    "DASHSCOPE_API_KEY": "LLM 模型",
    "SILICONFLOW_API_KEY": "LLM 模型",
    "XF_SPARK_API_PASSWORD": "讯飞星火 LLM",
    "OPENAI_COMPAT_API_KEY": "LLM 模型",
    "ANTHROPIC_COMPAT_API_KEY": "LLM 模型",
    "XF_TTS_APPID": "讯飞 TTS 语音合成",
    "XF_TTS_API_KEY": "讯飞 TTS 语音合成",
    "XF_TTS_API_SECRET": "讯飞 TTS 语音合成",
}


@router.get("/status")
async def get_status() -> dict[str, Any]:
    """返回每个凭据的当前来源（browser/env/missing）。绝不返回 Key 本体。"""
    items = []
    for key in sorted(SUPPORTED_KEYS):
        source = credential_source(key)
        items.append({
            "key": key,
            "label": KEY_LABELS.get(key, key),
            "group": KEY_GROUPS.get(key, "Other"),
            "source": source,
            "available": source != "missing",
        })
    return {
        "items": items,
        "note": "凭据从未持久化到服务端；浏览器配置仅存 localStorage，请求时通过 header 一次性传给后端。",
    }


class TestKeyRequest(BaseModel):
    key: str  # 比如 "DEEPSEEK_API_KEY"


@router.post("/test")
async def test_key(req: TestKeyRequest) -> dict[str, Any]:
    """轻量验证某个凭据可用性。"""
    name = req.key
    if name not in SUPPORTED_KEYS:
        return {"ok": False, "reason": f"unsupported key: {name}"}

    value = get_credential(name)
    if not value:
        return {"ok": False, "reason": "missing"}

    # LLM 凭据：发一个极短消息测试
    if name in {
        "DEEPSEEK_API_KEY", "DASHSCOPE_API_KEY", "SILICONFLOW_API_KEY",
        "XF_SPARK_API_PASSWORD", "OPENAI_COMPAT_API_KEY", "ANTHROPIC_COMPAT_API_KEY",
    }:
        return await _test_llm_key(name)

    # 讯飞 TTS 凭据：必须三个都有才能测
    if name.startswith("XF_TTS_"):
        return await _test_tts()

    return {"ok": True, "reason": "exists"}


async def _test_llm_key(name: str) -> dict[str, Any]:
    """用 ModelRouter 路由一个 chat 任务，发"hi"，看是否成功。"""
    from base.model_router import get_model_router
    from langchain_core.messages import HumanMessage

    try:
        router = get_model_router()
        # 根据 key 类型挑对应 profile（必须与 config/default.yaml 一致）
        profile_map = {
            "DEEPSEEK_API_KEY": "deepseek-chat",
            "DASHSCOPE_API_KEY": "qwen-turbo",
            "SILICONFLOW_API_KEY": "qwen2.5-7b",
            "XF_SPARK_API_PASSWORD": "iflytek-spark-lite",
        }
        profile = profile_map.get(name)
        if not profile:
            return {"ok": False, "reason": f"no test profile for {name}"}

        model, picked = router.for_task("chat", override=profile)
        result = await asyncio.wait_for(
            asyncio.to_thread(lambda: model.invoke([HumanMessage(content="hi")])),
            timeout=15.0,
        )
        text = result.content if hasattr(result, "content") else str(result)
        preview = (text or "")[:40]
        return {"ok": True, "profile": picked, "preview": preview}
    except asyncio.TimeoutError:
        return {"ok": False, "reason": "timeout (>15s)"}
    except Exception as exc:
        return {"ok": False, "reason": str(exc)[:240]}


async def _test_tts() -> dict[str, Any]:
    """讯飞 TTS：仅做凭据格式自检，避免真发请求消耗配额。"""
    from base.iflytek_factory import IFlytekTTS

    tts = IFlytekTTS()
    if not tts.is_ready():
        return {"ok": False, "reason": "讯飞 TTS 三个凭据 (APPID/APIKey/APISecret) 必须同时配置"}
    return {
        "ok": True,
        "reason": "凭据已就绪。实际合成会消耗讯飞配额，此处不发起测试请求。",
    }


# ── 动态模型拉取 ──────────────────────────────────────────────────


class FetchModelsRequest(BaseModel):
    api_key: str
    base_url: str
    api_format: str  # "openai" | "anthropic"


@router.post("/fetch-models")
async def fetch_models(req: FetchModelsRequest) -> dict[str, Any]:
    """根据 API Key + Base URL 动态拉取可用模型列表。

    支持 OpenAI 兼容格式和 Anthropic 格式。
    """
    api_key = req.api_key.strip()
    base_url = req.base_url.strip().rstrip("/")
    fmt = req.api_format.strip().lower()

    if not api_key or not base_url:
        return {"ok": False, "reason": "API Key 和 Base URL 不能为空", "models": []}

    try:
        if fmt == "anthropic":
            models = await _fetch_anthropic_models(api_key, base_url)
        else:
            models = await _fetch_openai_models(api_key, base_url)

        return {"ok": True, "models": models, "count": len(models)}
    except Exception as exc:
        logger.warning("fetch_models failed: %s", exc)
        return {"ok": False, "reason": str(exc)[:300], "models": []}


# 讯飞星火 OpenAI 兼容端点不支持 /models 接口（或返回非标准格式），
# 提供内置 fallback 列表，确保用户在前端仍可选择模型。
IFLYTEK_SPARK_BUILTIN_MODELS = [
    "4.0Ultra",
    "4.0Ultra-0412",
    "4.0Pro-0412",
    "4.0Pro",
    "4.0Air-0412",
    "4.0Air",
    "3.5",
    "3.5-Pro-32K",
    "lite",
    "generalv3.5",
    "generalv3",
    "max-32k",
    "pro-128k",
    "generalv2",
]


async def _fetch_openai_models(api_key: str, base_url: str) -> list[str]:
    """OpenAI 兼容格式：GET {base_url}/models"""
    url = f"{base_url}/models"
    headers = {"Authorization": f"Bearer {api_key}"}
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(url, headers=headers)
        resp.raise_for_status()
        data = resp.json()
    # OpenAI 格式: { data: [{ id: "model-name", ... }] }
    raw = data.get("data", []) if isinstance(data, dict) else data
    models = sorted({m.get("id", "") for m in raw if m.get("id")})
    # 如果接口返回空列表（某些提供商虽然 200 但 data 为空），也视为失败
    if not models:
        raise ValueError("接口返回成功但模型列表为空")
    return models


async def _fetch_anthropic_models(api_key: str, base_url: str) -> list[str]:
    """Anthropic 格式：GET {base_url}/v1/models"""
    # Anthropic API endpoint: {base_url}/v1/models
    url = f"{base_url}/v1/models" if "/v1" not in base_url else f"{base_url}/models"
    headers = {
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(url, headers=headers)
        resp.raise_for_status()
        data = resp.json()
    # Anthropic 格式: { data: [{ id: "claude-...", ... }] }
    raw = data.get("data", []) if isinstance(data, dict) else data
    models = sorted({m.get("id", "") for m in raw if m.get("id")})
    if not models:
        raise ValueError("接口返回成功但模型列表为空")
    return models
