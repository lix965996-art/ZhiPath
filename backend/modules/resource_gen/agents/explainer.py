"""ExplainerAgent：生成"动画讲解脚本" = 渐进 Mermaid + 旁白 + TTS 音频。"""
from __future__ import annotations

import re
from typing import Any

from pydantic import BaseModel

from base.base_agent import BaseAgent
from modules.resource_gen.prompts.explainer import (
    explainer_generator_system_prompt,
    explainer_generator_task_prompt,
)
from modules.resource_gen.schemas_explainer import ExplainerScript


_DANGER_PATTERNS = [
    r"<\s*script",
    r"</\s*script",
    r"<\s*iframe",
    r"\bclick\s+\w+\s+call",
    r"javascript:",
    r"data:text/html",
]


class ExplainerPayload(BaseModel):
    topic: str
    learner_profile: Any = None
    knowledge_context: str = ""


class ExplainerAgent(BaseAgent):
    name: str = "ExplainerAgent"

    def __init__(self, model: Any) -> None:
        super().__init__(
            model=model,
            system_prompt=explainer_generator_system_prompt,
            jsonalize_output=True,
        )

    def generate(self, input_dict: dict[str, Any]) -> dict[str, Any]:
        payload = ExplainerPayload(**input_dict).model_dump()
        raw = self.invoke(payload, task_prompt=explainer_generator_task_prompt)
        cleaned = _sanitize(raw if isinstance(raw, dict) else {})
        return ExplainerScript.model_validate(cleaned).model_dump()


def generate_explainer_with_llm(
    llm: Any,
    topic: str,
    learner_profile: Any = None,
    knowledge_context: str = "",
) -> dict[str, Any]:
    return ExplainerAgent(llm).generate({
        "topic": topic,
        "learner_profile": learner_profile,
        "knowledge_context": knowledge_context,
    })


def _sanitize(raw: dict[str, Any]) -> dict[str, Any]:
    raw.setdefault("title", "动画讲解")
    raw.setdefault("topic", "")
    raw.setdefault("diagram_type", "flowchart")
    full = str(raw.get("full_mermaid") or "")
    if not full.strip() or _has_danger(full):
        raw["full_mermaid"] = "flowchart TD\n  A[暂无可渲染图] --> B[请重试]"
    segs = raw.get("segments") or []
    cleaned: list[dict[str, Any]] = []
    for i, s in enumerate(segs):
        if not isinstance(s, dict):
            continue
        partial = str(s.get("mermaid_partial") or raw["full_mermaid"])
        if _has_danger(partial):
            partial = "flowchart TD\n  A[被安全护栏拦截]"
        nar = str(s.get("narration") or "").strip()
        if not nar:
            continue
        cleaned.append({
            "frame_id": int(s.get("frame_id", i + 1)),
            "narration": nar[:300],
            "mermaid_partial": partial,
            "duration_ms": max(5000, min(15000, int(s.get("duration_ms", 9000)))),
        })
    if not cleaned:
        cleaned.append({
            "frame_id": 1,
            "narration": "暂未生成讲解脚本，请重试。",
            "mermaid_partial": raw["full_mermaid"],
            "duration_ms": 6000,
        })
    raw["segments"] = cleaned
    return raw


def _has_danger(code: str) -> bool:
    for pat in _DANGER_PATTERNS:
        if re.search(pat, code, flags=re.I):
            return True
    return False
