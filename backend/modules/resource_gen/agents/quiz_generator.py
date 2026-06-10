from __future__ import annotations

from typing import Any, Mapping

from pydantic import BaseModel, Field

from base.base_agent import BaseAgent
from modules.resource_gen.prompts.quiz_generator import (
    quiz_generator_system_prompt,
    quiz_generator_task_prompt,
)
from modules.resource_gen.schemas import Quiz


class QuizPayload(BaseModel):
    learner_profile: Any
    learning_document: Any
    single_choice_count: int = 3
    multiple_choice_count: int = 0
    true_false_count: int = 0
    short_answer_count: int = 0


class QuizGenerator(BaseAgent):
    name: str = "QuizGenerator"

    def __init__(self, model: Any) -> None:
        super().__init__(
            model=model,
            system_prompt=quiz_generator_system_prompt,
            jsonalize_output=True,
        )

    def generate(self, input_dict: dict[str, Any]) -> dict[str, Any]:
        payload = QuizPayload(**input_dict).model_dump()
        raw = self.invoke(payload, task_prompt=quiz_generator_task_prompt)
        return Quiz.model_validate(raw).model_dump()


def generate_quiz_with_llm(
    llm: Any,
    learner_profile: Any,
    learning_document: str,
    single_choice_count: int = 3,
    multiple_choice_count: int = 0,
    true_false_count: int = 0,
    short_answer_count: int = 0,
) -> dict[str, Any]:
    gen = QuizGenerator(llm)
    return gen.generate({
        "learner_profile": learner_profile,
        "learning_document": learning_document,
        "single_choice_count": single_choice_count,
        "multiple_choice_count": multiple_choice_count,
        "true_false_count": true_false_count,
        "short_answer_count": short_answer_count,
    })
