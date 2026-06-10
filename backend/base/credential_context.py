"""Per-request 用户凭据上下文。

用 contextvars 维护"当前请求"用户提供的 LLM / 讯飞凭据：
- HTTP 请求由中间件从 X-LF-* header 注入 → 请求结束自动释放
- WebSocket 由 init 消息注入 → 整轮对话内有效
- 所有 LLM/TTS 工厂优先读这里，没有再回退环境变量

**安全设计**：
- 凭据**绝不持久化**到磁盘/数据库
- 不写日志，不写 trace attributes
- contextvars 是 asyncio 任务级别隔离，多用户并发不会串
"""
from __future__ import annotations

import contextvars
import os
from typing import Mapping

# 支持的凭据键名 — 与环境变量保持一致，方便回退
# 每个 LLM 服务可同时配置三件套：API_KEY (必) + BASE_URL (可选) + MODEL (可选)
SUPPORTED_KEYS = {
    # LLM API Keys
    "DEEPSEEK_API_KEY",
    "DASHSCOPE_API_KEY",
    "SILICONFLOW_API_KEY",
    "XF_SPARK_API_PASSWORD",
    # LLM Base URL Overrides（用户可在前端覆盖默认端点）
    "DEEPSEEK_BASE_URL",
    "DASHSCOPE_BASE_URL",
    "SILICONFLOW_BASE_URL",
    "XF_SPARK_BASE_URL",
    # LLM Model Overrides（用户可在前端覆盖默认模型名）
    "DEEPSEEK_MODEL",
    "DASHSCOPE_MODEL",
    "SILICONFLOW_MODEL",
    "XF_SPARK_MODEL",
    # 通用 OpenAI 兼容提供商
    "OPENAI_COMPAT_API_KEY",
    "OPENAI_COMPAT_BASE_URL",
    "OPENAI_COMPAT_MODEL",
    # 通用 Anthropic 提供商
    "ANTHROPIC_COMPAT_API_KEY",
    "ANTHROPIC_COMPAT_BASE_URL",
    "ANTHROPIC_COMPAT_MODEL",
    # 讯飞 TTS 三件套
    "XF_TTS_APPID",
    "XF_TTS_API_KEY",
    "XF_TTS_API_SECRET",
}

# 每个 LLM Profile 对应一组 (api_key_env, base_url_env, model_env)
# LLMFactory 在 from_profile 时会按 provider/api_key_env 找到对应组，
# 用户的 BASE_URL/MODEL 优先覆盖 yaml 默认。
PROFILE_OVERRIDE_GROUP = {
    "DEEPSEEK_API_KEY": ("DEEPSEEK_BASE_URL", "DEEPSEEK_MODEL"),
    "DASHSCOPE_API_KEY": ("DASHSCOPE_BASE_URL", "DASHSCOPE_MODEL"),
    "SILICONFLOW_API_KEY": ("SILICONFLOW_BASE_URL", "SILICONFLOW_MODEL"),
    "XF_SPARK_API_PASSWORD": ("XF_SPARK_BASE_URL", "XF_SPARK_MODEL"),
    "OPENAI_COMPAT_API_KEY": ("OPENAI_COMPAT_BASE_URL", "OPENAI_COMPAT_MODEL"),
    "ANTHROPIC_COMPAT_API_KEY": ("ANTHROPIC_COMPAT_BASE_URL", "ANTHROPIC_COMPAT_MODEL"),
}


def get_overrides_for(api_key_env: str) -> tuple[str | None, str | None]:
    """根据 api_key_env 名查找对应的 base_url 和 model override。

    返回 (base_url_value, model_value) — 来自用户浏览器或 env，没有则返回 (None, None)。
    """
    pair = PROFILE_OVERRIDE_GROUP.get(api_key_env)
    if pair is None:
        return None, None
    url_key, model_key = pair
    return get_credential(url_key), get_credential(model_key)

# 当前请求范围内的用户凭据（dict[str, str]）
_current_credentials: contextvars.ContextVar[dict[str, str] | None] = contextvars.ContextVar(
    "lf_user_credentials", default=None,
)


def set_credentials(credentials: Mapping[str, str] | None):
    """注入当前作用域的用户凭据。返回 token 用于后续 reset。"""
    if not credentials:
        return _current_credentials.set(None)
    # 只保留白名单 keys，过滤空值
    cleaned = {
        k: str(v).strip()
        for k, v in credentials.items()
        if k in SUPPORTED_KEYS and str(v or "").strip()
    }
    return _current_credentials.set(cleaned or None)


def reset_credentials(token) -> None:
    """对应 set_credentials 的释放。"""
    try:
        _current_credentials.reset(token)
    except (LookupError, ValueError):
        pass


def get_credential(name: str) -> str | None:
    """获取一个凭据：优先用户传的，回退 env。"""
    if name not in SUPPORTED_KEYS:
        return os.getenv(name)
    bucket = _current_credentials.get()
    if bucket and bucket.get(name):
        return bucket[name]
    return os.getenv(name)


def credential_source(name: str) -> str:
    """返回某个凭据当前的来源：'browser' / 'env' / 'missing'。"""
    if name not in SUPPORTED_KEYS:
        return "missing"
    bucket = _current_credentials.get()
    if bucket and bucket.get(name):
        return "browser"
    if os.getenv(name):
        return "env"
    return "missing"


class credential_scope:
    """同步 with-block 用：with credential_scope({...}): ..."""

    def __init__(self, credentials: Mapping[str, str] | None) -> None:
        self._credentials = credentials
        self._token = None

    def __enter__(self):
        self._token = set_credentials(self._credentials)
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self._token is not None:
            reset_credentials(self._token)
