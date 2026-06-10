"""动画讲解脚本 schema。"""
from __future__ import annotations

from pydantic import BaseModel, Field


class ExplainerSegment(BaseModel):
    frame_id: int
    narration: str = Field(..., description="本帧旁白")
    mermaid_partial: str = Field(..., description="本帧 mermaid 源码（渐进）")
    duration_ms: int = Field(default=9000)


class ExplainerScript(BaseModel):
    title: str = ""
    topic: str = ""
    diagram_type: str = "flowchart"
    full_mermaid: str = ""
    segments: list[ExplainerSegment] = Field(default_factory=list)
    audio_url: str | None = None
