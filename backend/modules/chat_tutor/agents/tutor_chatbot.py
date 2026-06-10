from __future__ import annotations

from typing import Any, Mapping, Optional, Sequence

from pydantic import BaseModel

from base.base_agent import BaseAgent
from base.search_rag import SearchRagManager
from modules.chat_tutor.prompts.tutor_chatbot import (
    ai_tutor_system_prompt,
    ai_tutor_task_prompt,
)


def _stringify_history(messages: Any) -> str:
    if not messages:
        return ""
    if isinstance(messages, str):
        return messages
    lines = []
    for m in messages:
        if isinstance(m, Mapping):
            role = str(m.get("role", "user"))
            content = str(m.get("content", ""))
        else:
            role = "user"
            content = str(m)
        lines.append(f"{role}: {content}")
    return "\n".join(lines)


class TutorChatPayload(BaseModel):
    learner_profile: Any = ""
    messages: Any
    use_search: bool = True
    top_k: int = 5


class AITutorChatbot(BaseAgent):
    name: str = "AITutorChatbot"

    def __init__(self, model: Any, search_rag_manager: Optional[SearchRagManager] = None) -> None:
        super().__init__(
            model=model,
            system_prompt=ai_tutor_system_prompt,
            jsonalize_output=False,
        )
        self.search_rag_manager = search_rag_manager

    def chat(self, input_dict: dict[str, Any]) -> str:
        payload = TutorChatPayload(**input_dict).model_dump()
        history_text = _stringify_history(payload["messages"])

        external_context = ""
        if self.search_rag_manager and payload.get("use_search"):
            try:
                # Extract last user message for search
                msgs = payload["messages"]
                if msgs:
                    last = msgs[-1] if isinstance(msgs, list) else None
                    if last and isinstance(last, Mapping):
                        query = str(last.get("content", ""))
                        docs = self.search_rag_manager.invoke(query)
                        external_context = "\n".join(str(d) for d in docs)
            except Exception:
                pass

        return self.invoke(
            {
                "learner_profile": payload.get("learner_profile", ""),
                "messages": history_text,
                "external_resources": external_context,
            },
            task_prompt=ai_tutor_task_prompt,
        )


def chat_with_tutor_with_llm(
    llm: Any,
    messages: Optional[Sequence[Mapping[str, Any]]] = None,
    learner_profile: Any = "",
    search_rag_manager: Optional[SearchRagManager] = None,
    use_search: bool = True,
) -> str:
    agent = AITutorChatbot(llm, search_rag_manager=search_rag_manager)
    return agent.chat({
        "learner_profile": learner_profile,
        "messages": messages or [],
        "use_search": use_search,
    })
