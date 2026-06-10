from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any
import time
import uuid


class EventType(str, Enum):
    SESSION = "session"
    STAGE_START = "stage_start"
    STAGE_END = "stage_end"
    THINKING = "thinking"
    CONTENT = "content"
    TOOL_CALL = "tool_call"
    TOOL_RESULT = "tool_result"
    SOURCES = "sources"
    RESULT = "result"
    ERROR = "error"
    DONE = "done"
    # 多智能体真实通信：Agent 之间传递结构化数据时 emit，前端用于工作流图实时高亮。
    AGENT_MESSAGE = "agent_message"
    # 画像维度被更新时 emit，前端"画像证据链"面板实时长出新维度。
    PROFILE_UPDATE = "profile_update"
    # Auto-Tutor 闭环阶段进度
    LOOP_STEP = "loop_step"


@dataclass
class StreamEvent:
    type: EventType
    content: str = ""
    source: str = ""
    stage: str = ""
    metadata: dict[str, Any] = field(default_factory=dict)
    session_id: str = ""
    turn_id: str = ""
    seq: int = 0
    timestamp: float = field(default_factory=time.time)

    def to_dict(self) -> dict[str, Any]:
        return {
            "type": self.type.value,
            "content": self.content,
            "source": self.source,
            "stage": self.stage,
            "metadata": self.metadata,
            "session_id": self.session_id,
            "turn_id": self.turn_id,
            "seq": self.seq,
            "timestamp": self.timestamp,
        }
