from __future__ import annotations

import os
from typing import Any, Optional

from langchain_core.language_models import BaseChatModel
from langchain.chat_models import init_chat_model
from bootstrap_env import load_project_env

load_project_env()

# Maps provider name → env var containing the API key
_PROVIDER_KEY_ENV = {
    "deepseek": "DEEPSEEK_API_KEY",
    "openai": "OPENAI_API_KEY",
    "anthropic": "ANTHROPIC_API_KEY",
}

# Provider-specific default base URLs
_PROVIDER_BASE_URL = {
    "qwen": "https://dashscope.aliyuncs.com/compatible-mode/v1",
}


class LLMFactory:
    """Create LLM instances via LangChain's init_chat_model.

    Supports DeepSeek, OpenAI, Anthropic, Ollama, Qwen, etc.
    """

    @staticmethod
    def create(
        model: Optional[str] = None,
        model_provider: Optional[str] = None,
        temperature: float = 0,
        base_url: Optional[str] = None,
        api_key: Optional[str] = None,
        **kwargs,
    ) -> BaseChatModel:
        if model is None:
            model = "deepseek-chat"
            model_provider = model_provider or "openai"

        config_kwargs: dict[str, Any] = {
            "model": model,
            "model_provider": model_provider,
            "temperature": temperature,
            **kwargs,
        }

        if base_url is not None:
            config_kwargs["base_url"] = base_url
        elif model_provider in _PROVIDER_BASE_URL:
            config_kwargs["base_url"] = _PROVIDER_BASE_URL[model_provider]

        if api_key is not None:
            config_kwargs["api_key"] = api_key
        elif base_url is not None and model_provider == "openai" and "localhost" in base_url:
            # Only use dummy key for local vLLM/Ollama, not remote APIs
            config_kwargs["api_key"] = "dummy-key-for-vllm"

        return init_chat_model(**config_kwargs)

    @classmethod
    def from_config(cls, config: dict[str, Any]) -> BaseChatModel:
        return cls.create(
            model=config.get("model_name", "deepseek-chat"),
            model_provider=config.get("model_provider", "openai"),
            base_url=config.get("base_url"),
            temperature=config.get("temperature", 0),
        )

    @classmethod
    def from_profile(cls, profile_name: Optional[str] = None) -> BaseChatModel:
        """从 yaml 配置的 profile 创建 LLM（回退用，读环境变量中的 API Key）。"""
        from config.loader import get_config

        config = get_config()
        name = profile_name or config.llm.default_profile
        profile = config.llm.profiles.get(name)

        if profile is None:
            return cls.create(model=name or "deepseek-chat", model_provider="deepseek")

        # 从环境变量读取 API Key（yaml profile 的回退机制）
        api_key_env = profile.api_key_env or _PROVIDER_KEY_ENV.get(profile.provider)
        api_key = os.environ.get(api_key_env) if api_key_env else None

        base_url = profile.base_url
        if base_url is None and profile.provider in _PROVIDER_BASE_URL:
            base_url = _PROVIDER_BASE_URL[profile.provider]

        return cls.create(
            model=profile.model_name,
            model_provider=profile.provider,
            temperature=profile.temperature,
            base_url=base_url,
            api_key=api_key,
        )

    @classmethod
    def from_api_config(cls, config) -> BaseChatModel:
        """从 ApiConfig 对象创建 LLM 实例。"""
        from base.credential_context import ApiConfig

        if not isinstance(config, ApiConfig):
            config = ApiConfig.from_dict(config)

        provider = "anthropic" if config.api_format == "anthropic" else "openai"
        default_model = "claude-sonnet-4-20250514" if provider == "anthropic" else "deepseek-chat"

        return cls.create(
            model=config.model or default_model,
            model_provider=provider,
            api_key=config.api_key,
            base_url=config.base_url,
            temperature=0,
        )
