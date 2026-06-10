from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from base.base_agent import BaseAgent
from modules.resource_gen.prompts.flashcard_generator import (
    flashcard_generator_system_prompt,
    flashcard_generator_task_prompt,
)
from modules.resource_gen.schemas import FlashcardSet


class FlashcardPayload(BaseModel):
    learning_document: str
    topic: str = ""


class FlashcardGenerator(BaseAgent):
    name: str = "FlashcardGenerator"

    def __init__(self, model: Any) -> None:
        super().__init__(
            model=model,
            system_prompt=flashcard_generator_system_prompt,
            jsonalize_output=True,
        )

    def generate(self, input_dict: dict[str, Any]) -> dict[str, Any]:
        payload = FlashcardPayload(**input_dict).model_dump()
        raw = self.invoke(payload, task_prompt=flashcard_generator_task_prompt)
        return FlashcardSet.model_validate(raw).model_dump()


def generate_flashcards_with_llm(
    llm: Any,
    learning_document: str,
    topic: str = "",
) -> dict[str, Any]:
    gen = FlashcardGenerator(llm)
    return gen.generate({
        "learning_document": learning_document,
        "topic": topic,
    })
