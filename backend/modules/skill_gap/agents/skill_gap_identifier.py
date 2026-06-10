from __future__ import annotations

from typing import Any, Dict, Optional

from pydantic import BaseModel, Field

from base.base_agent import BaseAgent
from modules.skill_gap.prompts.skill_gap_identifier import (
    skill_gap_identifier_system_prompt,
    skill_gap_identifier_task_prompt,
)
from modules.skill_gap.schemas import SkillGaps
from modules.skill_gap.agents.skill_requirement_mapper import SkillRequirementMapper


class SkillGapPayload(BaseModel):
    learning_goal: str = Field(...)
    learner_information: str = Field(...)
    skill_requirements: Dict[str, Any] = Field(...)


class SkillGapIdentifier(BaseAgent):
    name: str = "SkillGapIdentifier"

    def __init__(self, model: Any) -> None:
        super().__init__(
            model=model,
            system_prompt=skill_gap_identifier_system_prompt,
            jsonalize_output=True,
        )

    def identify_skill_gap(self, input_dict: dict[str, Any]) -> dict[str, Any]:
        payload = SkillGapPayload(**input_dict).model_dump()
        raw = self.invoke(payload, task_prompt=skill_gap_identifier_task_prompt)
        return SkillGaps.model_validate(raw).model_dump()


def identify_skill_gap_with_llm(
    llm: Any,
    learning_goal: str,
    learner_information: str,
    skill_requirements: Optional[dict[str, Any]] = None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """识别技能差距，返回 (差距结果, 使用的技能需求)"""
    if not skill_requirements:
        mapper = SkillRequirementMapper(llm)
        skill_requirements = mapper.map_goal_to_skill({"learning_goal": learning_goal})

    identifier = SkillGapIdentifier(llm)
    gaps = identifier.identify_skill_gap({
        "learning_goal": learning_goal,
        "learner_information": learner_information,
        "skill_requirements": skill_requirements,
    })
    return gaps, skill_requirements
