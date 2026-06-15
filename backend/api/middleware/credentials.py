"""HTTP 凭据中间件（简化版）：从 X-LF-Configs 和 X-LF-TTS header 注入 contextvars。

- X-LF-Configs: JSON 字符串，包含 ApiConfig 列表
- X-LF-TTS: JSON 字符串，包含 TTS 凭据

请求结束后 contextvars 自动释放。
"""
from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from base.credential_context import (
    parse_configs_from_json,
    parse_tts_from_json,
    reset_configs,
    reset_tts_creds,
    set_configs,
    set_tts_creds,
)


class CredentialsMiddleware(BaseHTTPMiddleware):
    """HTTP 凭据中间件：解析 X-LF-Configs / X-LF-TTS header。"""

    async def dispatch(self, request: Request, call_next) -> Response:
        cfg_token = None
        tts_token = None

        try:
            # 解析 API 配置列表
            configs_raw = request.headers.get("x-lf-configs")
            if configs_raw:
                configs = parse_configs_from_json(configs_raw)
                if configs:
                    cfg_token = set_configs(configs)

            # 解析 TTS 凭据
            tts_raw = request.headers.get("x-lf-tts")
            if tts_raw:
                tts = parse_tts_from_json(tts_raw)
                if tts:
                    tts_token = set_tts_creds(tts)

            return await call_next(request)
        finally:
            if cfg_token is not None:
                reset_configs(cfg_token)
            if tts_token is not None:
                reset_tts_creds(tts_token)
