from __future__ import annotations

import os
from typing import Any, Optional

from langchain_core.language_models import BaseChatModel
from langchain.chat_models import init_chat_model
from bootstrap_env import load_project_env
from base.credential_context import get_credential, get_overrides_for

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
            model = "deepseek-v4-flash"
            model_provider = model_provider or "deepseek"

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
            model=config.get("model_name", "deepseek-v4-flash"),
            model_provider=config.get("model_provider", "deepseek"),
            base_url=config.get("base_url"),
            temperature=config.get("temperature", 0),
        )

    @classmethod
    def from_profile(cls, profile_name: Optional[str] = None) -> BaseChatModel:
        """Create an LLM from a named profile in the config.

        If profile_name is None, uses the default profile.
        Falls back to deepseek-v4-flash if the profile doesn't exist.
        """
        from config.loader import get_config

        config = get_config()
        name = profile_name or config.llm.default_profile
        profile = config.llm.profiles.get(name)

        if profile is None:
            # Fallback: treat name as a model name with deepseek provider
            return cls.create(model=name or "deepseek-v4-flash", model_provider="deepseek")

        # Resolve API key: 优先用户在浏览器配置的，回退环境变量
        api_key_env = profile.api_key_env or _PROVIDER_KEY_ENV.get(profile.provider)
        api_key = get_credential(api_key_env) if api_key_env else None

        # 用户在前端可填的 base_url / model 覆盖（优先级最高）
        user_base_url, user_model = (None, None)
        if api_key_env:
            user_base_url, user_model = get_overrides_for(api_key_env)

        base_url = user_base_url or profile.base_url
        if base_url is None and profile.provider in _PROVIDER_BASE_URL:
            base_url = _PROVIDER_BASE_URL[profile.provider]

        model_name = user_model or profile.model_name

        return cls.create(
            model=model_name,
            model_provider=profile.provider,
            temperature=profile.temperature,
            base_url=base_url,
            api_key=api_key,
        )
