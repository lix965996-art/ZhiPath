from __future__ import annotations

from typing import Any, Optional

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import SystemMessage, HumanMessage

from utils.llm_output import preprocess_response


class BaseAgent:
    """Base agent wrapping a LangChain chat model.

    Pattern (from GenMentor):
    1. Validate input with Pydantic payload
    2. Format task prompt with variables
    3. Invoke LLM
    4. Parse and validate output
    """

    def __init__(
        self,
        model: BaseChatModel,
        system_prompt: Optional[str] = None,
        **kwargs,
    ) -> None:
        self._model = model
        self._system_prompt = system_prompt or ""
        self.exclude_think = kwargs.get("exclude_think", True)
        self.jsonalize_output = kwargs.get("jsonalize_output", True)

    def invoke(self, input_dict: dict[str, Any], task_prompt: str) -> Any:
        """Invoke the agent with formatted task prompt."""
        formatted_task = task_prompt.format(**input_dict)
        messages = []
        if self._system_prompt:
            messages.append(SystemMessage(content=self._system_prompt))
        messages.append(HumanMessage(content=formatted_task))

        raw_output = self._model.invoke(messages)
        return preprocess_response(
            raw_output,
            exclude_think=self.exclude_think,
            json_output=self.jsonalize_output,
        )

    async def ainvoke(self, input_dict: dict[str, Any], task_prompt: str) -> Any:
        """Async invoke the agent."""
        formatted_task = task_prompt.format(**input_dict)
        messages = []
        if self._system_prompt:
            messages.append(SystemMessage(content=self._system_prompt))
        messages.append(HumanMessage(content=formatted_task))

        raw_output = await self._model.ainvoke(messages)
        return preprocess_response(
            raw_output,
            exclude_think=self.exclude_think,
            json_output=self.jsonalize_output,
        )
