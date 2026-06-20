from __future__ import annotations

import os
from pathlib import Path

import yaml

from config.schemas import (
    AppConfig,
    LLMConfig,
    LLMProfileConfig,
    EmbeddingConfig,
    RerankerConfig,
    SearchConfig,
    RAGConfig,
    CodeLabConfig,
)

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
        dimensions=int(embed_raw.get("dimensions", 768)),
        base_url=embed_raw.get("base_url"),
        api_key_env=embed_raw.get("api_key_env"),
    )

    # ── RAG / reranker / search config ──
    rag_raw = raw.get("rag", {})
    reranker_raw = rag_raw.get("reranker", raw.get("reranker", {}))
    search_raw = rag_raw.get("search", raw.get("search", {}))

    reranker = RerankerConfig(
        enabled=reranker_raw.get("enabled", True),
        strategy=reranker_raw.get("strategy", "crossencoder"),
        model_name=reranker_raw.get("model_name", "cross-encoder/ms-marco-MiniLM-L-6-v2"),
        overfetch_factor=reranker_raw.get("overfetch_factor", 3),
        max_length=reranker_raw.get("max_length", 512),
    )

    search = SearchConfig(
        provider=search_raw.get("provider", "duckduckgo"),
        max_results=search_raw.get("max_results", 5),
        api_key_env=search_raw.get("api_key_env"),
    )

    rag = RAGConfig(
        chunk_size=rag_raw.get("chunk_size", 1000),
        num_retrieval_results=rag_raw.get("num_retrieval_results", 5),
        reranker=reranker,
        search=search,
    )

    # ── 代码实操沙箱配置 ──
    cl_raw = raw.get("code_lab", {})
    code_lab = CodeLabConfig(
        compiler_preference=tuple(cl_raw.get("compiler_preference", ("tcc", "gcc", "clang", "cl"))),
        compiler_path=os.getenv("ZHIPATH_C_COMPILER", cl_raw.get("compiler_path", "")),
        timeout_seconds=float(cl_raw.get("timeout_seconds", 5.0)),
        max_output_bytes=int(cl_raw.get("max_output_bytes", 65536)),
    )

    return AppConfig(
        llm=llm,
        embedding=embedding,
        rag=rag,
        code_lab=code_lab,
        database_url=os.getenv("DATABASE_URL", "postgresql+asyncpg://zhipath:zhipath@localhost:5432/zhipath"),
    )


# Singleton config
_config: AppConfig | None = None


def get_config() -> AppConfig:
    global _config
    if _config is None:
        _config = load_config()
    return _config
