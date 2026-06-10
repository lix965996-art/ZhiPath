from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class LLMProfileConfig:
    provider: str = "deepseek"
    model_name: str = "deepseek-v4-flash"
    base_url: str | None = None
    temperature: float = 0
    api_key_env: str | None = None  # env var name for this provider's key


@dataclass
class LLMConfig:
    default_profile: str = "deepseek-v4-flash"
    profiles: dict[str, LLMProfileConfig] = field(default_factory=dict)


@dataclass
class EmbeddingConfig:
    provider: str = "huggingface"
    model_name: str = "sentence-transformers/all-mpnet-base-v2"


@dataclass
class AppConfig:
    llm: LLMConfig = field(default_factory=LLMConfig)
    embedding: EmbeddingConfig = field(default_factory=EmbeddingConfig)
    database_url: str = "postgresql+asyncpg://postgres:123456@localhost:5433/zhipath"
