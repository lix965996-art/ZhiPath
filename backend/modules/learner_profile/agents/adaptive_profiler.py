from __future__ import annotations

from typing import Any, Dict, List, Mapping, Optional, Union

from pydantic import BaseModel, Field

from base.base_agent import BaseAgent
from modules.learner_profile.prompts.adaptive_profiler import (
    adaptive_learner_profiler_system_prompt,
    adaptive_learner_profiler_task_prompt_initialization,
    adaptive_learner_profiler_task_prompt_update,
)
from modules.learner_profile.schemas import LearnerProfile


class LearnerProfileInitializationPayload(BaseModel):
    learning_goal: str = Field(...)
    learner_information: Union[str, Dict[str, Any]]
    skill_gaps: Union[str, Dict[str, Any], List[Any]]


class LearnerProfileUpdatePayload(BaseModel):
    learner_profile: Union[str, Dict[str, Any]]
    learner_interactions: Union[str, Dict[str, Any]]
    learner_information: Union[str, Dict[str, Any]]
    session_information: Optional[Union[str, Dict[str, Any]]] = None


class AdaptiveLearnerProfiler(BaseAgent):
    name: str = "AdaptiveLearnerProfiler"

    def __init__(self, model: Any) -> None:
        super().__init__(
            model=model,
            system_prompt=adaptive_learner_profiler_system_prompt,
            jsonalize_output=True,
        )

    def initialize_profile(self, input_dict: dict[str, Any]) -> dict[str, Any]:
        payload = LearnerProfileInitializationPayload(**input_dict).model_dump()
        raw = self.invoke(payload, task_prompt=adaptive_learner_profiler_task_prompt_initialization)
        return LearnerProfile.model_validate(raw).model_dump()

    def update_profile(self, input_dict: dict[str, Any]) -> dict[str, Any]:
        payload = LearnerProfileUpdatePayload(**input_dict).model_dump()
        raw = self.invoke(payload, task_prompt=adaptive_learner_profiler_task_prompt_update)
        return LearnerProfile.model_validate(raw).model_dump()


def initialize_learner_profile_with_llm(
    llm: Any,
    learning_goal: str,
    learner_information: Union[str, Mapping[str, Any]],
    skill_gaps: Union[str, Mapping[str, Any], List[Any]],
) -> dict[str, Any]:
    profiler = AdaptiveLearnerProfiler(llm)
    return profiler.initialize_profile({
        "learning_goal": learning_goal,
        "learner_information": learner_information,
        "skill_gaps": skill_gaps,
    })


def update_learner_profile_with_llm(
    llm: Any,
    learner_profile: Union[str, Mapping[str, Any]],
    learner_interactions: Union[str, Mapping[str, Any]],
    learner_information: Union[str, Mapping[str, Any]],
    session_information: Optional[Union[str, Mapping[str, Any]]] = None,
) -> dict[str, Any]:
    profiler = AdaptiveLearnerProfiler(llm)
    return profiler.update_profile({
        "learner_profile": learner_profile,
        "learner_interactions": learner_interactions,
        "learner_information": learner_information,
        "session_information": session_information,
    })
