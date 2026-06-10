"""KGGenerator：让 LLM 输出"知识点 + 前置依赖" JSON，喂给 KnowledgeGraph。"""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel

from base.base_agent import BaseAgent
from modules.resource_gen.prompts.kg_generator import (
    kg_generator_system_prompt,
    kg_generator_task_prompt,
)


class KGPayload(BaseModel):
    learning_goal: str = ""
    learner_profile: Any = None
    learning_document: str = ""


class KGGenerator(BaseAgent):
    name: str = "KGGenerator"

    def __init__(self, model: Any) -> None:
        super().__init__(
            model=model,
            system_prompt=kg_generator_system_prompt,
            jsonalize_output=True,
        )

    def generate(self, input_dict: dict[str, Any]) -> dict[str, Any]:
        payload = KGPayload(**input_dict).model_dump()
        raw = self.invoke(payload, task_prompt=kg_generator_task_prompt)
        if not isinstance(raw, dict):
            return {"nodes": [], "edges": []}
        # 防御：保证基本结构
        nodes = raw.get("nodes") or []
        edges = raw.get("edges") or []
        return {"nodes": nodes, "edges": edges}


def generate_kg_with_llm(
    llm: Any,
    learning_goal: str = "",
    learner_profile: Any = None,
    learning_document: str = "",
) -> dict[str, Any]:
    return KGGenerator(llm).generate({
        "learning_goal": learning_goal,
        "learner_profile": learner_profile,
        "learning_document": learning_document,
    })
