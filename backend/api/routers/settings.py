"""Settings API — 前端可视化配置 API Key 和自定义 LLM 端点。

提供端点：
- GET  /api/v1/settings/env         读取当前 key（脱敏）
- POST /api/v1/settings/env         保存 key 到 .env
- GET  /api/v1/settings/status      检查哪些 key 已配置
- GET  /api/v1/settings/custom-llm  读取自定义 LLM 端点配置
- POST /api/v1/settings/custom-llm  保存自定义 LLM 端点配置
"""
from __future__ import annotations

import json
import os
import re
from pathlib import Path

from dotenv import dotenv_values, set_key
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/api/v1/settings", tags=["settings"])

# .env 文件路径（与 bootstrap_env.py 保持一致）
_ENV_FILE = Path(__file__).resolve().parent.parent.parent / ".env"

# 自定义 LLM 端点配置文件路径
_CUSTOM_LLM_FILE = Path(__file__).resolve().parent.parent.parent / "custom_llm.json"

# 需要在前端展示的 key 配置项
# 每项：env_var 名称、分组、中文标签、placeholder 提示
SETTINGS_FIELDS: list[dict[str, str]] = [
    # ── LLM 模型 Key ──
    {
        "env_var": "DEEPSEEK_API_KEY",
        "group": "LLM 模型",
        "label": "DeepSeek API Key",
        "placeholder": "sk-...",
        "description": "主力模型，覆盖结构化输出、推理、代码等场景",
    },
    {
        "env_var": "DASHSCOPE_API_KEY",
        "group": "LLM 模型",
        "label": "通义千问 (DashScope) API Key",
        "placeholder": "sk-...",
        "description": "阿里云 DashScope，Qwen 系列模型",
    },
    {
        "env_var": "SILICONFLOW_API_KEY",
        "group": "LLM 模型",
        "label": "硅基流动 (SiliconFlow) API Key",
        "placeholder": "sk-...",
        "description": "智谱 GLM / Moonshot Kimi 统一平台",
    },
    # ── 讯飞能力（可选） ──
    {
        "env_var": "XF_SPARK_API_PASSWORD",
        "group": "讯飞星火 LLM",
        "label": "星火 API Password",
        "placeholder": "OpenAI 兼容 SDK key",
        "description": "讯飞星火大模型，用于 chat 任务首选",
    },
    {
        "env_var": "XF_TTS_APPID",
        "group": "讯飞 TTS 语音合成",
        "label": "TTS APPID",
        "placeholder": "讯飞开放平台应用 APPID",
        "description": "超拟人 TTS 语音合成（可选，不影响主流程）",
    },
    {
        "env_var": "XF_TTS_API_KEY",
        "group": "讯飞 TTS 语音合成",
        "label": "TTS APIKey",
        "placeholder": "讯飞 TTS APIKey",
        "description": "",
    },
    {
        "env_var": "XF_TTS_API_SECRET",
        "group": "讯飞 TTS 语音合成",
        "label": "TTS APISecret",
        "placeholder": "讯飞 TTS APISecret",
        "description": "",
    },
]


def _mask_key(value: str) -> str:
    """脱敏：保留前 4 位 + ****。"""
    if not value or value.startswith("your_"):
        return ""
    if len(value) <= 8:
        return "****"
    return value[:4] + "****"


class EnvReadItem(BaseModel):
    env_var: str
    group: str
    label: str
    placeholder: str
    description: str
    masked_value: str
    is_set: bool


class EnvSaveRequest(BaseModel):
    keys: dict[str, str]  # env_var -> value


@router.get("/env", response_model=list[EnvReadItem])
async def read_env():
    """读取当前 .env 中的 key 配置（脱敏）。"""
    env_values = dotenv_values(_ENV_FILE) if _ENV_FILE.is_file() else {}
    result = []
    for field in SETTINGS_FIELDS:
        raw = env_values.get(field["env_var"], "") or ""
        is_set = bool(raw) and not raw.startswith("your_")
        result.append(
            EnvReadItem(
                env_var=field["env_var"],
                group=field["group"],
                label=field["label"],
                placeholder=field["placeholder"],
                description=field["description"],
                masked_value=_mask_key(raw) if is_set else "",
                is_set=is_set,
            )
        )
    return result


@router.post("/env")
async def save_env(req: EnvSaveRequest):
    """保存 key 到 .env 文件，保存后立即生效。"""
    # 确保 .env 文件存在
    if not _ENV_FILE.is_file():
        # 创建一个基础 .env
        _ENV_FILE.write_text(
            "# ZhiPath 环境变量配置\n"
            "DATABASE_URL=postgresql+asyncpg://zhipath:zhipath@localhost:5432/zhipath\n"
            "BACKEND_HOST=0.0.0.0\n"
            "BACKEND_PORT=8000\n"
            "FRONTEND_PORT=3000\n",
            encoding="utf-8",
        )

    saved = []
    for env_var, value in req.keys.items():
        # 只处理已知的配置项
        if not any(f["env_var"] == env_var for f in SETTINGS_FIELDS):
            continue
        # 跳过空值（不覆盖已有值）
        if not value or not value.strip():
            continue
        # 写入 .env
        set_key(str(_ENV_FILE), env_var, value.strip())
        # 同步到当前进程环境变量
        os.environ[env_var] = value.strip()
        saved.append(env_var)

    # 重新加载环境变量
    from bootstrap_env import load_project_env
    load_project_env()

    return {"saved": saved, "count": len(saved)}


class StatusItem(BaseModel):
    env_var: str
    label: str
    group: str
    configured: bool


@router.get("/status", response_model=list[StatusItem])
async def get_status():
    """快速检查哪些 key 已配置。"""
    env_values = dotenv_values(_ENV_FILE) if _ENV_FILE.is_file() else {}
    return [
        StatusItem(
            env_var=f["env_var"],
            label=f["label"],
            group=f["group"],
            configured=bool(env_values.get(f["env_var"], ""))
            and not env_values.get(f["env_var"], "").startswith("your_"),
        )
        for f in SETTINGS_FIELDS
    ]


# ── 自定义 LLM 端点 ──────────────────────────────────────────────


class CustomLlmConfig(BaseModel):
    enabled: bool = False
    base_url: str = ""
    api_key: str = ""
    model_name: str = ""
    api_format: str = "openai"  # "openai" | "anthropic" | "custom"


def _load_custom_llm() -> CustomLlmConfig:
    """从 custom_llm.json 加载配置。"""
    if _CUSTOM_LLM_FILE.is_file():
        try:
            data = json.loads(_CUSTOM_LLM_FILE.read_text(encoding="utf-8"))
            return CustomLlmConfig(**data)
        except Exception:
            pass
    return CustomLlmConfig()


def _save_custom_llm(config: CustomLlmConfig) -> None:
    """保存配置到 custom_llm.json 并同步到环境变量。"""
    _CUSTOM_LLM_FILE.write_text(
        json.dumps(config.model_dump(), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    # 同步到环境变量，让 ModelRouter 能立即感知
    if config.enabled and config.base_url:
        os.environ["CUSTOM_LLM_BASE_URL"] = config.base_url
        os.environ["CUSTOM_LLM_API_KEY"] = config.api_key
        os.environ["CUSTOM_LLM_MODEL"] = config.model_name
        os.environ["CUSTOM_LLM_API_FORMAT"] = config.api_format
    else:
        for k in ("CUSTOM_LLM_BASE_URL", "CUSTOM_LLM_API_KEY", "CUSTOM_LLM_MODEL", "CUSTOM_LLM_API_FORMAT"):
            os.environ.pop(k, None)


# 启动时加载一次
_custom_llm_env = _load_custom_llm()
if _custom_llm_env.enabled and _custom_llm_env.base_url:
    os.environ["CUSTOM_LLM_BASE_URL"] = _custom_llm_env.base_url
    os.environ["CUSTOM_LLM_API_KEY"] = _custom_llm_env.api_key
    os.environ["CUSTOM_LLM_MODEL"] = _custom_llm_env.model_name
    os.environ["CUSTOM_LLM_API_FORMAT"] = _custom_llm_env.api_format


@router.get("/custom-llm", response_model=CustomLlmConfig)
async def get_custom_llm():
    """读取自定义 LLM 端点配置。"""
    return _load_custom_llm()


@router.post("/custom-llm")
async def save_custom_llm(config: CustomLlmConfig):
    """保存自定义 LLM 端点配置。"""
    _save_custom_llm(config)
    return {"saved": True}
