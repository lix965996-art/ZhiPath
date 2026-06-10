from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class UnifiedContext:
    """编排器入口 DTO：user_message 为当前句；conversation_history 不含当前句（由 ws 层约定）。"""

    session_id: str
    user_message: str
    active_capability: str = "chat"
    conversation_history: list[dict[str, str]] = field(default_factory=list)
    language: str = "zh"

    # Memory
    memory_context: str | None = None

    # RAG
    knowledge_context: str | None = None

    # Learner state
    learner_profile: dict[str, Any] | None = None
    learning_goal: str | None = None

    # Config overrides
    config_overrides: dict[str, Any] = field(default_factory=dict)

    # Metadata
    metadata: dict[str, Any] = field(default_factory=dict)
