from __future__ import annotations

from typing import Any

from pydantic import BaseModel

from base.base_agent import BaseAgent
from modules.resource_gen.prompts.mindmap_generator import (
    mindmap_generator_system_prompt,
    mindmap_generator_task_prompt,
)
from modules.resource_gen.schemas import MindMap


class MindMapPayload(BaseModel):
    learning_document: str
    topic: str = ""


class MindMapGenerator(BaseAgent):
    name: str = "MindMapGenerator"

    def __init__(self, model: Any) -> None:
        super().__init__(
            model=model,
            system_prompt=mindmap_generator_system_prompt,
            jsonalize_output=True,
        )

    def generate(self, input_dict: dict[str, Any]) -> dict[str, Any]:
        payload = MindMapPayload(**input_dict).model_dump()
        raw = self.invoke(payload, task_prompt=mindmap_generator_task_prompt)
        return MindMap.model_validate(raw).model_dump()


def generate_mindmap_with_llm(
    llm: Any,
    learning_document: str,
    topic: str = "",
) -> dict[str, Any]:
    gen = MindMapGenerator(llm)
    return gen.generate({
        "learning_document": learning_document,
        "topic": topic,
    })
