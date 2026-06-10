from __future__ import annotations

import os
from pathlib import Path

import yaml

from config.schemas import AppConfig, LLMConfig, LLMProfileConfig, EmbeddingConfig

_CONFIG_DIR = Path(__file__).parent


def load_config() -> AppConfig:
    """Load config from default.yaml, with env var overrides."""
    config_path = _CONFIG_DIR / "default.yaml"
    with open(config_path, encoding="utf-8") as f:
        raw = yaml.safe_load(f)

    llm_raw = raw.get("llm", {})
    profiles_raw = llm_raw.get("profiles", {})
    profiles: dict[str, LLMProfileConfig] = {}
    for name, p in profiles_raw.items():
        profiles[name] = LLMProfileConfig(
            provider=p.get("provider", "deepseek"),
            model_name=p.get("model_name", "deepseek-v4-flash"),
            base_url=p.get("base_url"),
            temperature=p.get("temperature", 0),
            api_key_env=p.get("api_key_env"),
        )

    llm = LLMConfig(
        default_profile=llm_raw.get("default_profile", "deepseek-v4-flash"),
        profiles=profiles,
    )

    embed_raw = raw.get("embedding", {})
    embedding = EmbeddingConfig(
        provider=embed_raw.get("provider", "huggingface"),
        model_name=embed_raw.get("model_name", "sentence-transformers/all-mpnet-base-v2"),
    )

    return AppConfig(
        llm=llm,
        embedding=embedding,
        database_url=os.getenv("DATABASE_URL", "postgresql+asyncpg://zhipath:zhipath@localhost:5432/zhipath"),
    )


# Singleton config
_config: AppConfig | None = None


def get_config() -> AppConfig:
    global _config
    if _config is None:
        _config = load_config()
    return _config
