from __future__ import annotations

from typing import Any, Dict, Mapping, Optional, Sequence, Union

from pydantic import BaseModel, Field

from base.base_agent import BaseAgent
from modules.learning_path.prompts.path_scheduler import (
    learning_path_scheduler_system_prompt,
    learning_path_scheduler_task_prompt_session,
    learning_path_scheduler_task_prompt_reflexion,
    learning_path_scheduler_task_prompt_reschedule,
)
from modules.learning_path.schemas import LearningPath


class SessionSchedulePayload(BaseModel):
    learner_profile: Union[str, Dict[str, Any], Mapping[str, Any]]
    session_count: int = 5


class LearningPathRefinementPayload(BaseModel):
    learning_path: Sequence[Any]
    feedback: Union[str, Dict[str, Any], Mapping[str, Any]]


class LearningPathReschedulePayload(BaseModel):
    learner_profile: Union[str, Dict[str, Any], Mapping[str, Any]]
    learning_path: Sequence[Any]
    session_count: Optional[Union[int, str]] = None
    other_feedback: Optional[Union[str, Dict[str, Any], Mapping[str, Any]]] = None


class LearningPathScheduler(BaseAgent):
    name: str = "LearningPathScheduler"

    def __init__(self, model: Any) -> None:
        super().__init__(
            model=model,
            system_prompt=learning_path_scheduler_system_prompt,
            jsonalize_output=True,
        )

    def schedule_session(self, input_dict: dict[str, Any]) -> dict[str, Any]:
        payload = SessionSchedulePayload(**input_dict).model_dump()
        raw = self.invoke(payload, task_prompt=learning_path_scheduler_task_prompt_session)
        return LearningPath.model_validate(raw).model_dump()

    def reflexion(self, input_dict: dict[str, Any]) -> dict[str, Any]:
        payload = LearningPathRefinementPayload(**input_dict).model_dump()
        raw = self.invoke(payload, task_prompt=learning_path_scheduler_task_prompt_reflexion)
        return LearningPath.model_validate(raw).model_dump()

    def reschedule(self, input_dict: dict[str, Any]) -> dict[str, Any]:
        payload = LearningPathReschedulePayload(**input_dict).model_dump()
        raw = self.invoke(payload, task_prompt=learning_path_scheduler_task_prompt_reschedule)
        return LearningPath.model_validate(raw).model_dump()


def schedule_learning_path_with_llm(
    llm: Any,
    learner_profile: Mapping[str, Any],
    session_count: int = 5,
) -> dict[str, Any]:
    scheduler = LearningPathScheduler(llm)
    return scheduler.schedule_session({
        "learner_profile": learner_profile,
        "session_count": session_count,
    })


def reschedule_learning_path_with_llm(
    llm: Any,
    learning_path: Sequence[Any],
    learner_profile: Mapping[str, Any],
    session_count: Optional[int] = None,
    other_feedback: Optional[Union[str, Mapping[str, Any]]] = None,
) -> dict[str, Any]:
    scheduler = LearningPathScheduler(llm)
    return scheduler.reschedule({
        "learner_profile": learner_profile,
        "learning_path": learning_path,
        "session_count": session_count,
        "other_feedback": other_feedback,
    })


def refine_learning_path_with_llm(
    llm: Any,
    learning_path: Sequence[Any],
    feedback: Mapping[str, Any],
) -> dict[str, Any]:
    scheduler = LearningPathScheduler(llm)
    return scheduler.reflexion({
        "learning_path": learning_path,
        "feedback": feedback,
    })
