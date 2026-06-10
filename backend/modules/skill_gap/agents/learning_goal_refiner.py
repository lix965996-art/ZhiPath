from __future__ import annotations

from typing import Any, Dict

from pydantic import BaseModel, Field

from base.base_agent import BaseAgent
from modules.skill_gap.prompts.learning_goal_refiner import (
    learning_goal_refiner_system_prompt,
    learning_goal_refiner_task_prompt,
)
from modules.skill_gap.schemas import RefinedLearningGoal


class RefineGoalPayload(BaseModel):
    learning_goal: str = Field(...)
    learner_information: str = Field("")


class LearningGoalRefiner(BaseAgent):
    name: str = "LearningGoalRefiner"

    def __init__(self, model: Any) -> None:
        super().__init__(
            model=model,
            system_prompt=learning_goal_refiner_system_prompt,
            jsonalize_output=True,
        )

    def refine_goal(self, input_dict: dict[str, Any]) -> dict[str, Any]:
        payload = RefineGoalPayload(**input_dict).model_dump()
        raw = self.invoke(payload, task_prompt=learning_goal_refiner_task_prompt)
        return RefinedLearningGoal.model_validate(raw).model_dump()


def refine_learning_goal_with_llm(
    llm: Any,
    learning_goal: str,
    learner_information: str = "",
) -> dict[str, Any]:
    refiner = LearningGoalRefiner(llm)
    return refiner.refine_goal({
        "learning_goal": learning_goal,
        "learner_information": learner_information,
    })
