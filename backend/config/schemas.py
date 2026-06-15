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
class RerankerConfig:
    enabled: bool = True
    strategy: str = "crossencoder"          # "crossencoder" | "llm" | "none"
    model_name: str = "cross-encoder/ms-marco-MiniLM-L-6-v2"
    overfetch_factor: int = 3               # fetch k * factor candidates before reranking
    max_length: int = 512                   # max token length for cross-encoder inputs


@dataclass
class SearchConfig:
    provider: str = "duckduckgo"
    max_results: int = 5
    api_key_env: str | None = None          # for providers requiring API keys (Bing, SerpAPI)


@dataclass
class RAGConfig:
    chunk_size: int = 1000
    num_retrieval_results: int = 5
    reranker: RerankerConfig = field(default_factory=RerankerConfig)
    search: SearchConfig = field(default_factory=SearchConfig)


@dataclass
class CodeLabConfig:
    """代码实操沙箱配置：编译运行学生 C 代码。"""
    compiler_preference: tuple[str, ...] = ("tcc", "gcc", "clang", "cl")  # 按顺序自动探测
    compiler_path: str = ""        # 显式指定编译器路径；空则按 preference + PATH 探测
    timeout_seconds: float = 5.0   # 编译+运行总超时
    max_output_bytes: int = 65536  # stdout/stderr 截断阈值


@dataclass
class AppConfig:
    llm: LLMConfig = field(default_factory=LLMConfig)
    embedding: EmbeddingConfig = field(default_factory=EmbeddingConfig)
    rag: RAGConfig = field(default_factory=RAGConfig)
    code_lab: CodeLabConfig = field(default_factory=CodeLabConfig)
    database_url: str = "postgresql+asyncpg://postgres:123456@localhost:5433/zhipath"
