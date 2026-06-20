"""知识库向量编码器。

两种 provider：
- "dashscope" / "openai"：调 OpenAI 兼容的 embeddings API（DashScope text-embedding-v3 等）。
  中文原生、免本地 torch、可指定输出维度（须与 pgvector 列维度一致）。
- "huggingface"：本地 sentence-transformers（需要可用的 torch）。

暴露 langchain Embeddings 风格接口：embed_documents(list)->list[list[float]] / embed_query(str)->list[float]。
"""
from __future__ import annotations

import json
import logging
import os
import time
import urllib.request
from typing import Any

logger = logging.getLogger(__name__)

_embeddings_instance: Any = None


class _ApiEmbeddings:
    """OpenAI 兼容 embeddings API 客户端（urllib 实现，零额外依赖、免 torch）。"""

    def __init__(self, model: str, dimensions: int, base_url: str, api_key: str) -> None:
        self.model = model
        self.dimensions = int(dimensions)
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self._qcache: dict[str, list[float]] = {}  # query 向量缓存，省重复 API 往返
        if not api_key:
            logger.warning("API embedding 缺少 API Key，向量检索将不可用。")

    def _post(self, inputs: list[str]) -> list[list[float]]:
        body = json.dumps({
            "model": self.model,
            "input": inputs,
            "dimensions": self.dimensions,
            "encoding_format": "float",
        }).encode("utf-8")
        req = urllib.request.Request(
            f"{self.base_url}/embeddings",
            data=body,
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {self.api_key}"},
        )
        last_exc: Exception | None = None
        for attempt in range(3):
            try:
                with urllib.request.urlopen(req, timeout=60) as resp:
                    data = json.loads(resp.read())
                # 按 index 排序，保证与输入顺序一致
                rows = sorted(data["data"], key=lambda d: d.get("index", 0))
                return [r["embedding"] for r in rows]
            except Exception as exc:  # noqa: BLE001 - 网络/限流重试
                last_exc = exc
                time.sleep(1.0 * (attempt + 1))
        raise RuntimeError(f"embeddings API 调用失败：{last_exc}")

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        out: list[list[float]] = []
        for i in range(0, len(texts), 10):  # DashScope text-embedding-v3 单批上限较小，按 10 切
            out.extend(self._post(texts[i:i + 10]))
        return out

    def embed_query(self, text: str) -> list[float]:
        cached = self._qcache.get(text)
        if cached is not None:
            return cached
        vec = self._post([text])[0]
        if len(self._qcache) < 2000:  # 有界，避免无限增长
            self._qcache[text] = vec
        return vec


def get_embeddings() -> Any:
    global _embeddings_instance
    if _embeddings_instance is not None:
        return _embeddings_instance

    from config.loader import get_config

    cfg = get_config().embedding
    provider = (cfg.provider or "huggingface").lower()

    if provider in ("dashscope", "openai", "api"):
        api_key = os.environ.get(cfg.api_key_env or "DASHSCOPE_API_KEY", "")
        base_url = cfg.base_url or "https://dashscope.aliyuncs.com/compatible-mode/v1"
        logger.info("Using API embeddings: %s (dim=%d, base=%s)", cfg.model_name, cfg.dimensions, base_url)
        _embeddings_instance = _ApiEmbeddings(cfg.model_name, cfg.dimensions, base_url, api_key)
        return _embeddings_instance

    # 本地 HuggingFace（需要 torch）
    from langchain_huggingface import HuggingFaceEmbeddings

    logger.info("Loading local embedding model: %s", cfg.model_name)
    _embeddings_instance = HuggingFaceEmbeddings(
        model_name=cfg.model_name,
        model_kwargs={"device": "cpu"},
        encode_kwargs={"normalize_embeddings": True},
    )
    logger.info("Embedding model loaded")
    return _embeddings_instance


def reset_embeddings_cache() -> None:
    """测试/换模型用：清掉单例，下次按最新 config 重建。"""
    global _embeddings_instance
    _embeddings_instance = None
