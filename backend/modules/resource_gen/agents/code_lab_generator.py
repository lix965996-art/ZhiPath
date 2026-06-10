"""CodeLabGenerator：把"代码类实操案例"作为多模态资源生成的一类。

输出会被前端 CodeLabCard 拉进 Pyodide 浏览器沙箱里直接运行。
"""
from __future__ import annotations

import re
from typing import Any

from pydantic import BaseModel

from base.base_agent import BaseAgent
from modules.resource_gen.prompts.code_lab_generator import (
    code_lab_generator_system_prompt,
    code_lab_generator_task_prompt,
)
from modules.resource_gen.schemas import CodeLab


# 与 prompt 中"安全护栏"保持一致；任何匹配都会被拒收（生成时再过一道）。
_FORBIDDEN_PATTERNS = [
    r"\bos\.system\b",
    r"\bsubprocess\b",
    r"\b__import__\b",
    r"\beval\s*\(",
    r"\bexec\s*\(",
    r"\bopen\s*\([^)]*['\"]w",
    r"\bpip\s+install\b",
    r"\brequests\.\w+\(",
    r"\bsocket\b",
]


class CodeLabPayload(BaseModel):
    learner_profile: Any
    learning_document: Any
    user_request: str


class CodeLabGenerator(BaseAgent):
    name: str = "CodeLabGenerator"

    def __init__(self, model: Any) -> None:
        super().__init__(
            model=model,
            system_prompt=code_lab_generator_system_prompt,
            jsonalize_output=True,
        )

    def generate(self, input_dict: dict[str, Any]) -> dict[str, Any]:
        payload = CodeLabPayload(**input_dict).model_dump()
        raw = self.invoke(payload, task_prompt=code_lab_generator_task_prompt)
        sanitized = _enforce_safety(raw if isinstance(raw, dict) else {})
        return CodeLab.model_validate(sanitized).model_dump()


def generate_code_lab_with_llm(
    llm: Any,
    learner_profile: Any,
    learning_document: str,
    user_request: str = "",
) -> dict[str, Any]:
    gen = CodeLabGenerator(llm)
    return gen.generate({
        "learner_profile": learner_profile,
        "learning_document": learning_document,
        "user_request": user_request,
    })


def _enforce_safety(raw: dict[str, Any]) -> dict[str, Any]:
    """对每段代码再做一道关键字过滤；命中则替换为带说明的注释占位。"""
    snippets = raw.get("snippets") or []
    cleaned: list[dict[str, Any]] = []
    for snip in snippets:
        if not isinstance(snip, dict):
            continue
        code = str(snip.get("code", ""))
        if _is_unsafe(code):
            snip = {
                **snip,
                "code": "# 该片段被安全护栏拦截（涉及受限调用）\nprint('snippet blocked by guardrail')",
                "description": (snip.get("description", "") + "（已被安全护栏拦截）").strip(),
            }
        snip.setdefault("language", "python")
        cleaned.append(snip)
    raw["snippets"] = cleaned
    raw.setdefault("title", "代码实操")
    raw.setdefault("language", "python")
    raw.setdefault("practice_tasks", [])
    return raw


def _is_unsafe(code: str) -> bool:
    for pattern in _FORBIDDEN_PATTERNS:
        if re.search(pattern, code):
            return True
    return False
