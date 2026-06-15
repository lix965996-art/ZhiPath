"""凭据测试与模型拉取 API（简化版）。

- POST /test          测试一个 API 配置是否可用
- POST /fetch-models  动态拉取可用模型列表
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any, Literal

import httpx
from fastapi import APIRouter
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/credentials", tags=["credentials"])


# ── 请求模型 ──────────────────────────────────────────────────


class ApiConfigRequest(BaseModel):
    """前端发送的单个 API 配置。"""
    id: str = ""
    name: str = ""
    apiKey: str = ""
    baseUrl: str = ""
    model: str = ""
    apiFormat: Literal["openai", "anthropic"] = "openai"


class TestResult(BaseModel):
    ok: bool
    reason: str = ""
    preview: str = ""


class FetchModelsResult(BaseModel):
    ok: bool
    reason: str = ""
    models: list[str] = []
    count: int = 0


class TtsTestRequest(BaseModel):
    appid: str = ""
    apiKey: str = ""
    apiSecret: str = ""


# ── 测试连接 ──────────────────────────────────────────────────


@router.post("/test", response_model=TestResult)
async def test_config(req: ApiConfigRequest) -> TestResult:
    """测试 API 配置是否可用：发送 'hi' 看是否能成功调用。"""
    api_key = req.apiKey.strip()
    base_url = req.baseUrl.strip()
    model = req.model.strip()
    api_format = req.apiFormat

    if not api_key:
        return TestResult(ok=False, reason="请先填写 API Key")
    if not base_url:
        return TestResult(ok=False, reason="请先填写 Base URL")

    try:
        if api_format == "openai":
            result = await _test_openai(api_key, base_url, model)
        else:
            result = await _test_anthropic(api_key, base_url, model)
        return result
    except asyncio.TimeoutError:
        return TestResult(ok=False, reason="连接超时 (>20s)，请检查 URL 是否正确")
    except Exception as exc:
        return TestResult(ok=False, reason=str(exc)[:300])


async def _test_openai(api_key: str, base_url: str, model: str) -> TestResult:
    """OpenAI 兼容格式：直接用 httpx 发 chat completions 请求，路径和 fetch-models 保持一致。"""
    url = f"{base_url}/chat/completions"
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    payload = {
        "model": model or "gpt-4o",
        "messages": [{"role": "user", "content": "hi"}],
        "max_tokens": 20,
    }
    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.post(url, headers=headers, json=payload)
        resp.raise_for_status()
        data = resp.json()
    choices = data.get("choices", [])
    preview = (choices[0].get("message", {}).get("content", "") if choices else "")[:80]
    return TestResult(ok=True, reason="连接成功", preview=preview)


async def _test_anthropic(api_key: str, base_url: str, model: str) -> TestResult:
    """Anthropic 格式：直接用 httpx 发 messages 请求。"""
    url = f"{base_url}/v1/messages" if "/v1" not in base_url else f"{base_url}/messages"
    headers = {
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model or "claude-sonnet-4-20250514",
        "messages": [{"role": "user", "content": "hi"}],
        "max_tokens": 20,
    }
    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.post(url, headers=headers, json=payload)
        resp.raise_for_status()
        data = resp.json()
    content = ""
    for block in data.get("content", []):
        if block.get("type") == "text":
            content = block.get("text", "")
            break
    return TestResult(ok=True, reason="连接成功", preview=content[:80])


# ── 测试 TTS 连接 ─────────────────────────────────────────────


@router.post("/test-tts", response_model=TestResult)
async def test_tts_config(req: TtsTestRequest) -> TestResult:
    """测试讯飞 TTS 凭据是否可用：合成一句短文本验证。"""
    import logging as _logging
    _logging.getLogger("base.iflytek_factory").setLevel(_logging.DEBUG)

    appid = req.appid.strip()
    api_key = req.apiKey.strip()
    api_secret = req.apiSecret.strip()

    logger.info(
        "TTS test: appid=%s (len=%d) api_key=%s…%s (len=%d) api_secret=%s…%s (len=%d)",
        appid, len(appid),
        api_key[:4], api_key[-4:], len(api_key),
        api_secret[:4], api_secret[-4:], len(api_secret),
    )

    if not all([appid, api_key, api_secret]):
        return TestResult(ok=False, reason="请填写 APPID、APIKey、APISecret 三个字段")

    try:
        from base.iflytek_factory import IFlytekTTS

        tts = IFlytekTTS(appid=appid, api_key=api_key, api_secret=api_secret)
        if not tts.is_ready():
            return TestResult(ok=False, reason="凭据解析失败")

        url = tts.synthesize("测试连接", filename_hint="test")
        if url:
            return TestResult(ok=True, reason="TTS 连接成功，音频已生成", preview=url)
        return TestResult(ok=False, reason="合成返回为空，请检查凭据是否正确")

    except Exception as exc:
        logger.warning("TTS test failed: %s", exc)
        return TestResult(ok=False, reason=str(exc)[:300])


# ── 拉取模型列表 ──────────────────────────────────────────────

# 讯飞星火内置模型列表（其 API 不标准地返回 models）
IFLYTEK_SPARK_BUILTIN_MODELS = [
    "4.0Ultra", "4.0Ultra-0412", "4.0Pro-0412", "4.0Pro",
    "4.0Air-0412", "4.0Air", "3.5", "3.5-Pro-32K",
    "lite", "generalv3.5", "generalv3", "max-32k", "pro-128k", "generalv2",
]


@router.post("/fetch-models", response_model=FetchModelsResult)
async def fetch_models(req: ApiConfigRequest) -> FetchModelsResult:
    """根据 API Key + Base URL 动态拉取可用模型列表。"""
    api_key = req.apiKey.strip()
    base_url = req.baseUrl.strip().rstrip("/")
    api_format = req.apiFormat.strip().lower()

    if not api_key:
        return FetchModelsResult(ok=False, reason="请先填写 API Key", models=[])
    if not base_url:
        return FetchModelsResult(ok=False, reason="请先填写 Base URL", models=[])

    try:
        if api_format == "anthropic":
            models = await _fetch_anthropic_models(api_key, base_url)
        else:
            models = await _fetch_openai_models(api_key, base_url)

        return FetchModelsResult(ok=True, models=models, count=len(models))
    except Exception as exc:
        logger.warning("fetch_models failed: %s", exc)
        return FetchModelsResult(ok=False, reason=str(exc)[:300], models=[])


async def _fetch_openai_models(api_key: str, base_url: str) -> list[str]:
    """OpenAI 兼容格式：GET {base_url}/models"""
    url = f"{base_url}/models"
    headers = {"Authorization": f"Bearer {api_key}"}
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(url, headers=headers)
        resp.raise_for_status()
        data = resp.json()
    raw = data.get("data", []) if isinstance(data, dict) else data
    models = sorted({m.get("id", "") for m in raw if m.get("id")})
    if not models:
        raise ValueError("接口返回成功但模型列表为空")
    return models


async def _fetch_anthropic_models(api_key: str, base_url: str) -> list[str]:
    """Anthropic 格式：GET {base_url}/v1/models"""
    url = f"{base_url}/v1/models" if "/v1" not in base_url else f"{base_url}/models"
    headers = {
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(url, headers=headers)
        resp.raise_for_status()
        data = resp.json()
    raw = data.get("data", []) if isinstance(data, dict) else data
    models = sorted({m.get("id", "") for m in raw if m.get("id")})
    if not models:
        raise ValueError("接口返回成功但模型列表为空")
    return models
