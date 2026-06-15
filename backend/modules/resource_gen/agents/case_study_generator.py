"""CaseStudyGenerator：真实场景案例分析生成器。

产出 bug_hunt / performance / architecture / scenario 四类案例，
用于锻炼学生的工程分析能力。代码片段会经过安全护栏过滤。
"""
from __future__ import annotations

import re
from typing import Any

from pydantic import BaseModel

from base.base_agent import BaseAgent
from modules.resource_gen.prompts.case_study_generator import (
    case_study_generator_system_prompt,
    case_study_generator_task_prompt,
)
from modules.resource_gen.schemas import CaseStudy


# 与 CodeLabGenerator 对齐的安全护栏
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

# 额外的敏感信息护栏（防止泄露凭据/密钥）
_SENSITIVE_PATTERNS = [
    r"password\s*=\s*['\"][^'\"]+['\"]",     # 硬编码密码
    r"api[_-]?key\s*=\s*['\"][^'\"]+['\"]",  # 硬编码 API Key
    r"secret\s*=\s*['\"][^'\"]+['\"]",       # 硬编码 Secret
]


class CaseStudyPayload(BaseModel):
    learner_profile: Any
    learning_document: Any
    user_request: str = ""
    case_count: int = 3


class CaseStudyGenerator(BaseAgent):
    name: str = "CaseStudyGenerator"

    def __init__(self, model: Any) -> None:
        super().__init__(
            model=model,
            system_prompt=case_study_generator_system_prompt,
            jsonalize_output=True,
        )

    def generate(self, input_dict: dict[str, Any]) -> dict[str, Any]:
        payload = CaseStudyPayload(**input_dict).model_dump()
        raw = self.invoke(payload, task_prompt=case_study_generator_task_prompt)
        sanitized = _enforce_safety(raw if isinstance(raw, dict) else {})
        return CaseStudy.model_validate(sanitized).model_dump()


def generate_case_study_with_llm(
    llm: Any,
    learner_profile: Any,
    learning_document: str,
    user_request: str = "",
    case_count: int = 3,
) -> dict[str, Any]:
    gen = CaseStudyGenerator(llm)
    return gen.generate({
        "learner_profile": learner_profile,
        "learning_document": learning_document,
        "user_request": user_request,
        "case_count": case_count,
    })


def _enforce_safety(raw: dict[str, Any]) -> dict[str, Any]:
    """对每个案例的代码片段做安全过滤，同时做基础结构补全。"""
    cases = raw.get("cases") or []
    cleaned: list[dict[str, Any]] = []
    for case in cases:
        if not isinstance(case, dict):
            continue
        code = str(case.get("code_snippet", ""))
        if code and _is_unsafe(code):
            case = {
                **case,
                "code_snippet": "# 该代码片段被安全护栏拦截（涉及受限调用或敏感信息）\nprint('case blocked by guardrail')",
                "scenario": (case.get("scenario", "") + "（代码部分已被安全护栏拦截，请基于场景描述进行分析）").strip(),
            }
        # 补全默认字段
        case.setdefault("case_type", "scenario")
        case.setdefault("code_language", "")
        case.setdefault("difficulty", "medium")
        case.setdefault("knowledge_points", [])
        case.setdefault("hints", [])
        cleaned.append(case)
    raw["cases"] = cleaned
    raw.setdefault("title", "案例分析")
    raw.setdefault("description", "基于学习内容生成的案例分析集")
    return raw


def _is_unsafe(code: str) -> bool:
    for pattern in _FORBIDDEN_PATTERNS + _SENSITIVE_PATTERNS:
        if re.search(pattern, code, flags=re.I):
            return True
    return False
