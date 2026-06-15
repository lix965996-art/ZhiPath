"""CodeLabGenerator：把"代码类实操案例"作为多模态资源生成的一类。

学生会在前端补全 TODO，后端编译运行他们的 C 代码，用「实际输出 == expected_output」判定逻辑。
- 只在适合写 C 代码的 408 主题生成；不适合时返回 None（不硬凑）。
- 生成后再过一道 C 安全护栏（与 services.guardrail.code_safety 对齐）。
"""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel

from base.base_agent import BaseAgent
from modules.resource_gen.prompts.code_lab_generator import (
    code_lab_generator_system_prompt,
    code_lab_generator_task_prompt,
)
from modules.resource_gen.schemas import CodeLab
from services.code_lab.suitability import topic_supports_code
from services.guardrail.code_safety import check_code_safety


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
        sanitized = _normalize(raw if isinstance(raw, dict) else {})
        return CodeLab.model_validate(sanitized).model_dump()


def generate_code_lab_with_llm(
    llm: Any,
    learner_profile: Any,
    learning_document: str,
    user_request: str = "",
) -> dict[str, Any] | None:
    """生成代码实操。主题不适合写代码时返回 None（不调 LLM、不硬凑）。"""
    profile_goal = ""
    if isinstance(learner_profile, dict):
        profile_goal = str(learner_profile.get("learning_goal") or learner_profile.get("goal") or "")
    if not topic_supports_code(user_request, profile_goal, learning_document):
        return None

    gen = CodeLabGenerator(llm)
    return gen.generate({
        "learner_profile": learner_profile,
        "learning_document": learning_document,
        "user_request": user_request,
    })


def _normalize(raw: dict[str, Any]) -> dict[str, Any]:
    """补默认值 + 对每段代码再过一道 C 安全护栏。命中则替换为带说明的占位。"""
    raw.setdefault("title", "C 语言代码实操")
    raw.setdefault("language", "c")
    raw.setdefault("practice_tasks", [])

    snippets = raw.get("snippets") or []
    cleaned: list[dict[str, Any]] = []
    for snip in snippets:
        if not isinstance(snip, dict):
            continue
        code = str(snip.get("code", ""))
        safety = check_code_safety(code)
        if not safety.safe:
            snip = {
                **snip,
                "code": "/* 该片段被安全护栏拦截（涉及受限调用），请按任务说明重新实现 */\nint main(void) { return 0; }",
                "description": (snip.get("description", "") + "（已被安全护栏拦截）").strip(),
                "checkpoints": [],
            }
        snip.setdefault("language", "c")
        snip.setdefault("title", f"C 语言任务 {len(cleaned) + 1}")
        snip.setdefault("description", "")
        snip.setdefault("test_input", "")
        snip.setdefault("expected_output", "")
        snip.setdefault("checkpoints", [])
        snip.setdefault("hints", [])
        cleaned.append(snip)
    raw["snippets"] = cleaned
    return raw
