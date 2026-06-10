from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)

_embeddings_instance: Any = None


def get_embeddings() -> Any:
    global _embeddings_instance
    if _embeddings_instance is None:
        from config.loader import get_config
        from langchain_huggingface import HuggingFaceEmbeddings

        config = get_config()
        model_name = config.embedding.model_name
        logger.info("Loading embedding model: %s", model_name)
        _embeddings_instance = HuggingFaceEmbeddings(
            model_name=model_name,
            model_kwargs={"device": "cpu"},
            encode_kwargs={"normalize_embeddings": True},
        )
        logger.info("Embedding model loaded")
    return _embeddings_instance
