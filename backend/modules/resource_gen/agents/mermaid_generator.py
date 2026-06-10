"""MermaidGenerator：把"知识结构"提升到可执行 Mermaid 图表层级。

Mermaid 比纯思维导图多覆盖：flowchart / sequenceDiagram / stateDiagram / classDiagram /
erDiagram / gantt / mindmap。一张时序图就是一个标准多模态资源。
"""
from __future__ import annotations

import re
from typing import Any

from pydantic import BaseModel

from base.base_agent import BaseAgent
from modules.resource_gen.prompts.mermaid_generator import (
    mermaid_generator_system_prompt,
    mermaid_generator_task_prompt,
)
from modules.resource_gen.schemas import MermaidDiagram


# 简单防注入：不允许 script、html、外部 click 行为
_DANGEROUS_PATTERNS = [
    r"<\s*script",
    r"</\s*script",
    r"<\s*iframe",
    r"\bclick\s+\w+\s+call",
    r"javascript:",
    r"data:text/html",
]

_ALLOWED_TYPES = {
    "flowchart",
    "graph",
    "sequenceDiagram",
    "stateDiagram",
    "stateDiagram-v2",
    "classDiagram",
    "erDiagram",
    "gantt",
    "mindmap",
    "journey",
    "pie",
    "timeline",
}


class MermaidPayload(BaseModel):
    learning_goal: str = ""
    learner_profile: Any = None
    learning_document: str = ""


class MermaidGenerator(BaseAgent):
    name: str = "MermaidGenerator"

    def __init__(self, model: Any) -> None:
        super().__init__(
            model=model,
            system_prompt=mermaid_generator_system_prompt,
            jsonalize_output=True,
        )

    def generate(self, input_dict: dict[str, Any]) -> dict[str, Any]:
        payload = MermaidPayload(**input_dict).model_dump()
        raw = self.invoke(payload, task_prompt=mermaid_generator_task_prompt)
        cleaned = _sanitize(raw if isinstance(raw, dict) else {})
        return MermaidDiagram.model_validate(cleaned).model_dump()


def generate_mermaid_with_llm(
    llm: Any,
    learning_goal: str = "",
    learner_profile: Any = None,
    learning_document: str = "",
) -> dict[str, Any]:
    return MermaidGenerator(llm).generate({
        "learning_goal": learning_goal,
        "learner_profile": learner_profile,
        "learning_document": learning_document,
    })


def _sanitize(raw: dict[str, Any]) -> dict[str, Any]:
    code = str(raw.get("mermaid_code") or "")
    if not code.strip():
        # 最小可用占位，避免前端解析空字符串
        raw["mermaid_code"] = "flowchart TD\n  A[暂无可渲染图] --> B[请重试]"
        raw.setdefault("diagram_type", "flowchart")
        raw.setdefault("title", "占位图")
        raw.setdefault("narrative", "")
        raw.setdefault("alternatives", [])
        return raw

    # 拒收任何危险 token
    for pat in _DANGEROUS_PATTERNS:
        if re.search(pat, code, flags=re.I):
            raw["mermaid_code"] = "flowchart TD\n  A[图表被安全护栏拦截] --> B[请重新生成]"
            raw["narrative"] = "（生成内容命中 Mermaid 安全护栏，已替换为占位）"
            break

    # 推断 diagram_type（如果模型没给/给错）
    declared = str(raw.get("diagram_type") or "").strip()
    first = code.strip().split()[0] if code.strip() else "flowchart"
    if declared not in _ALLOWED_TYPES:
        raw["diagram_type"] = first if first in _ALLOWED_TYPES else "flowchart"

    raw.setdefault("title", "知识结构图")
    raw.setdefault("narrative", "")
    raw.setdefault("alternatives", [])
    return raw
