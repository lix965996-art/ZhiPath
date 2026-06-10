"""HTTP 凭据中间件：从 X-LF-* request header 解析用户凭据注入 contextvars。

header 命名映射：
    X-LF-Deepseek-Key        → DEEPSEEK_API_KEY
    X-LF-Dashscope-Key       → DASHSCOPE_API_KEY
    X-LF-Siliconflow-Key     → SILICONFLOW_API_KEY
    X-LF-Xf-Spark-Password   → XF_SPARK_API_PASSWORD
    X-LF-Xf-Tts-Appid        → XF_TTS_APPID
    X-LF-Xf-Tts-Api-Key      → XF_TTS_API_KEY
    X-LF-Xf-Tts-Api-Secret   → XF_TTS_API_SECRET

请求结束后 contextvars 自动释放，下一个请求看不到上一个用户的凭据。
"""
from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from base.credential_context import reset_credentials, set_credentials


# header 名 → 环境变量名
# 每个 LLM 服务三件套：Key / BaseURL / Model
HEADER_MAP = {
    # API Keys
    "x-lf-deepseek-key": "DEEPSEEK_API_KEY",
    "x-lf-dashscope-key": "DASHSCOPE_API_KEY",
    "x-lf-siliconflow-key": "SILICONFLOW_API_KEY",
    "x-lf-xf-spark-password": "XF_SPARK_API_PASSWORD",
    # Base URL overrides
    "x-lf-deepseek-base-url": "DEEPSEEK_BASE_URL",
    "x-lf-dashscope-base-url": "DASHSCOPE_BASE_URL",
    "x-lf-siliconflow-base-url": "SILICONFLOW_BASE_URL",
    "x-lf-xf-spark-base-url": "XF_SPARK_BASE_URL",
    # Model overrides
    "x-lf-deepseek-model": "DEEPSEEK_MODEL",
    "x-lf-dashscope-model": "DASHSCOPE_MODEL",
    "x-lf-siliconflow-model": "SILICONFLOW_MODEL",
    "x-lf-xf-spark-model": "XF_SPARK_MODEL",
    # 讯飞 TTS
    "x-lf-xf-tts-appid": "XF_TTS_APPID",
    "x-lf-xf-tts-api-key": "XF_TTS_API_KEY",
    "x-lf-xf-tts-api-secret": "XF_TTS_API_SECRET",
    # 通用 OpenAI 兼容
    "x-lf-openai-compat-api-key": "OPENAI_COMPAT_API_KEY",
    "x-lf-openai-compat-base-url": "OPENAI_COMPAT_BASE_URL",
    "x-lf-openai-compat-model": "OPENAI_COMPAT_MODEL",
    # 通用 Anthropic 兼容
    "x-lf-anthropic-compat-api-key": "ANTHROPIC_COMPAT_API_KEY",
    "x-lf-anthropic-compat-base-url": "ANTHROPIC_COMPAT_BASE_URL",
    "x-lf-anthropic-compat-model": "ANTHROPIC_COMPAT_MODEL",
}


def parse_credentials_from_headers(headers) -> dict[str, str]:
    """从 headers 抽取凭据（不区分大小写）。"""
    creds: dict[str, str] = {}
    for header_name, env_name in HEADER_MAP.items():
        value = headers.get(header_name)
        if value and isinstance(value, str):
            value = value.strip()
            if value:
                creds[env_name] = value
    return creds


class CredentialsMiddleware(BaseHTTPMiddleware):
    """HTTP 凭据中间件。"""

    async def dispatch(self, request: Request, call_next) -> Response:
        creds = parse_credentials_from_headers(request.headers)
        token = set_credentials(creds) if creds else None
        try:
            return await call_next(request)
        finally:
            if token is not None:
                reset_credentials(token)
