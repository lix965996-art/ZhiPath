from __future__ import annotations

from typing import Any, Dict

from pydantic import BaseModel, Field

from base.base_agent import BaseAgent
from modules.skill_gap.prompts.skill_requirement_mapper import (
    skill_requirement_mapper_system_prompt,
    skill_requirement_mapper_task_prompt,
)
from modules.skill_gap.schemas import SkillRequirements


class Goal2SkillPayload(BaseModel):
    learning_goal: str = Field(...)


class SkillRequirementMapper(BaseAgent):
    name: str = "SkillRequirementMapper"

    def __init__(self, model: Any) -> None:
        super().__init__(
            model=model,
            system_prompt=skill_requirement_mapper_system_prompt,
            jsonalize_output=True,
        )

    def map_goal_to_skill(self, input_dict: dict[str, Any]) -> dict[str, Any]:
        payload = Goal2SkillPayload(**input_dict).model_dump()
        raw = self.invoke(payload, task_prompt=skill_requirement_mapper_task_prompt)
        return SkillRequirements.model_validate(raw).model_dump()


def map_goal_to_skills_with_llm(llm: Any, learning_goal: str) -> dict[str, Any]:
    mapper = SkillRequirementMapper(llm)
    return mapper.map_goal_to_skill({"learning_goal": learning_goal})
