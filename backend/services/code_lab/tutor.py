"""代码实操「导师点拨」：学生 C 代码没通过时，给一条诊断 + 一条提示。

和简答批改器(services.quiz.short_answer_grader)同源的「教你写」理念：
- 只点出**思路/代码断在哪一步**，不直接把正确代码甩出来（保护有效挣扎）。
- 一次只给**一条**最关键的下一步提示或苏格拉底式追问。
- 由前端「请导师点拨」按钮显式触发（学生主动求助才调 LLM，省成本也更像真老师）。

LLM 不可用或异常时返回 None，前端据此不展示点拨块，绝不抛错阻断判题。
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from utils.llm_output import convert_json_output, get_text_from_response

logger = logging.getLogger(__name__)

# 失败类型 → 给 LLM 的中文说明，帮它聚焦该往哪个方向点拨
_REASON_HINT = {
    "compile_error": "代码编译不通过（语法/类型错误）",
    "runtime_error": "能编译但运行时出错（如越界、空指针、返回值非 0）",
    "timeout": "运行超时，很可能有死循环或递归不收敛",
    "wrong_output": "能编译运行，但实际输出和期望不一致（逻辑写错了）",
}

_MAX_CODE = 4000   # 截断超长代码，控制 token
_MAX_ERR = 1500


@dataclass
class CodeCoach:
    diagnosis: str          # 一句话：代码/思路断在哪
    hint: str               # 一条下一步提示或追问（不直接给答案）
    focus: str = ""         # 需要回顾的知识点（可空）

    def to_dict(self) -> dict[str, Any]:
        return {"diagnosis": self.diagnosis, "hint": self.hint, "focus": self.focus}


_SYSTEM_PROMPT = (
    "你是一位坐在学生旁边的 C 语言/数据结构辅导老师，面向 408 考研代码实操。"
    "学生刚提交的代码没通过，你的任务**不是把正确代码写给他**，而是像老师一样："
    "一眼看出他卡在哪、为什么没对，然后只用一句话点醒他、再给一条能让他自己改对的下一步提示。"
    "绝对不要输出完整的正确代码或正确答案，最多点到某一行/某个变量/某个边界条件。"
)

_TASK_PROMPT = """学生在做下面这道 C 代码实操题，没有通过。请点拨他。

【任务说明】
{description}

【期望输出】
{expected}

【失败类型】
{reason_desc}

【编译/运行错误信息（可能为空）】
{stderr}

【期望 vs 实际 的逐行差异（可能为空）】
{diff}

【学生提交的代码】
```c
{code}
```

请严格输出 JSON（不要任何额外文字、不要 markdown 代码块）：
{{
  "diagnosis": "一句话(不超过60字)：直接点出他代码/思路断在哪一步、为什么没对，可以提到具体某行或某个变量",
  "hint": "一条下一步提示或追问(一句话)，引导他自己改对，绝对不要写出完整正确代码",
  "focus": "需要回顾的知识点(几个字，如「数组越界」「循环边界」「指针解引用」)，没有就空字符串"
}}"""


def _clean(text: str, limit: int) -> str:
    t = (text or "").strip()
    return t[:limit] if len(t) > limit else t


async def coach_code_lab(
    description: str,
    expected_output: str,
    code: str,
    reason: str,
    stderr: str = "",
    diff: list[str] | None = None,
    llm: Any | None = None,
) -> CodeCoach | None:
    """给一次代码实操点拨。任何异常都返回 None（前端不展示点拨块）。"""
    if not (code or "").strip():
        return None

    if llm is None:
        try:
            from base.model_router import get_model_router

            llm, _ = get_model_router().for_task("chat")
        except Exception as exc:  # noqa: BLE001
            logger.warning("代码点拨取 LLM 失败：%s", exc)
            return None

    diff_text = "\n".join(diff) if diff else "（无）"
    messages = [
        SystemMessage(content=_SYSTEM_PROMPT),
        HumanMessage(content=_TASK_PROMPT.format(
            description=_clean(description, 800) or "（无任务说明）",
            expected=_clean(expected_output, 600) or "（题目未给定期望输出）",
            reason_desc=_REASON_HINT.get(reason, "代码未通过判定"),
            stderr=_clean(stderr, _MAX_ERR) or "（无）",
            diff=_clean(diff_text, 1200),
            code=_clean(code, _MAX_CODE),
        )),
    ]
    try:
        raw = await llm.ainvoke(messages)
        data = convert_json_output(get_text_from_response(raw))
    except Exception as exc:  # noqa: BLE001
        logger.warning("代码点拨 LLM 调用失败：%s", exc)
        return None

    if not isinstance(data, dict):
        return None
    diagnosis = str(data.get("diagnosis") or "").strip()
    hint = str(data.get("hint") or "").strip()
    if not diagnosis and not hint:
        return None
    return CodeCoach(diagnosis=diagnosis, hint=hint, focus=str(data.get("focus") or "").strip())
