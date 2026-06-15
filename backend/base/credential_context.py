"""Per-request 用户 API 配置上下文。

简化设计：
- 前端配置一组 ApiConfig（key + url + model + format + taskTypes）
- 通过 HTTP header (X-LF-Configs) 或 WebSocket init 消息注入
- 后端用 contextvars 绑定到当前请求，请求结束自动释放
- TTS 凭据独立存储

安全设计：
- 凭据绝不持久化到磁盘/数据库
- 不写日志，不写 trace attributes
- contextvars 是 asyncio 任务级别隔离
"""
from __future__ import annotations

import contextvars
import json
import logging
from dataclasses import dataclass, field
from typing import Any, Literal, Mapping

logger = logging.getLogger(__name__)


@dataclass
class ApiConfig:
    """单个 LLM API 配置。"""
    id: str
    name: str
    api_key: str
    base_url: str
    model: str
    api_format: Literal["openai", "anthropic"] = "openai"
    task_types: list[str] = field(default_factory=lambda: [
        "chat", "structured", "reasoning", "code", "long_form", "mermaid",
    ])
    enabled: bool = True

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> ApiConfig:
        """从字典创建，容忍额外字段。"""
        return cls(
            id=data.get("id", ""),
            name=data.get("name", ""),
            api_key=data.get("apiKey", data.get("api_key", "")),
            base_url=data.get("baseUrl", data.get("base_url", "")),
            model=data.get("model", ""),
            api_format=data.get("apiFormat", data.get("api_format", "openai")),
            task_types=data.get("taskTypes", data.get("task_types", [])),
            enabled=data.get("enabled", True),
        )


# ── 请求上下文 ──────────────────────────────────────────────────

_current_configs: contextvars.ContextVar[list[ApiConfig] | None] = contextvars.ContextVar(
    "lf_api_configs", default=None,
)

_current_tts: contextvars.ContextVar[dict[str, str] | None] = contextvars.ContextVar(
    "lf_tts_creds", default=None,
)


def set_configs(configs: list[ApiConfig] | None):
    """注入当前请求的用户 API 配置列表。返回 token 用于 reset。"""
    return _current_configs.set(configs)


def reset_configs(token) -> None:
    """释放 set_configs。"""
    try:
        _current_configs.reset(token)
    except (LookupError, ValueError):
        pass


def get_configs() -> list[ApiConfig]:
    """获取当前请求的用户配置列表。"""
    return _current_configs.get() or []


def get_config_for_task(task_type: str) -> ApiConfig | None:
    """根据任务类型查找第一个适用的启用配置。"""
    for cfg in get_configs():
        if cfg.enabled and task_type in cfg.task_types and cfg.api_key:
            return cfg
    return None


def get_any_enabled_config() -> ApiConfig | None:
    """获取任意一个启用的配置（兜底用）。"""
    for cfg in get_configs():
        if cfg.enabled and cfg.api_key:
            return cfg
    return None


# ── TTS 凭据（独立） ──────────────────────────────────────────

TTS_KEYS = {"XF_TTS_APPID", "XF_TTS_API_KEY", "XF_TTS_API_SECRET"}


def set_tts_creds(creds: dict[str, str] | None):
    return _current_tts.set(creds)


def reset_tts_creds(token) -> None:
    try:
        _current_tts.reset(token)
    except (LookupError, ValueError):
        pass


def get_tts_creds() -> dict[str, str]:
    return _current_tts.get() or {}


# ── 兼容旧代码的 credential_scope ──────────────────────────────

class credential_scope:
    """同步 with-block 用：with credential_scope(configs, tts): ..."""

    def __init__(
        self,
        configs: list[ApiConfig] | None = None,
        tts: dict[str, str] | None = None,
    ) -> None:
        self._configs = configs
        self._tts = tts
        self._cfg_token = None
        self._tts_token = None

    def __enter__(self):
        if self._configs is not None:
            self._cfg_token = set_configs(self._configs)
        if self._tts is not None:
            self._tts_token = set_tts_creds(self._tts)
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self._cfg_token is not None:
            reset_configs(self._cfg_token)
        if self._tts_token is not None:
            reset_tts_creds(self._tts_token)


# ── JSON 解析 helper ──────────────────────────────────────────

def parse_configs_from_json(raw: str) -> list[ApiConfig]:
    """从 JSON 字符串解析 ApiConfig 列表。"""
    try:
        data = json.loads(raw)
        if not isinstance(data, list):
            return []
        return [ApiConfig.from_dict(item) for item in data]
    except (json.JSONDecodeError, TypeError):
        return []


def parse_tts_from_json(raw: str) -> dict[str, str]:
    """从 JSON 字符串解析 TTS 凭据。"""
    try:
        data = json.loads(raw)
        if not isinstance(data, dict):
            return {}
        return {k: str(v).strip() for k, v in data.items() if k in TTS_KEYS and str(v or "").strip()}
    except (json.JSONDecodeError, TypeError):
        return {}
