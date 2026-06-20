"""简答题 LLM rubric 批改。

把学生的自由文本答案，按「参考答案拆出的要点(rubric)」逐点比对，给出：
- 0~1 的得分
- 答到的要点 / 漏掉的要点 / 说错的地方
- 一段「你思路断在哪」的诊断
- 一条苏格拉底式追问（只点拨、不直接给答案）——为后续「做题导师」闭环留接口

设计动机：原 feedback_service 对简答题用「字符串完全相等」判分，等于没在判
「会不会写」，只在判「有没有照抄」。本模块把它换成真正按内容给分的批改。

LLM 不可用时降级为字符级 2-gram 覆盖率启发式，保证离线也能给个粗判，绝不抛错。
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from utils.llm_output import convert_json_output, get_text_from_response

logger = logging.getLogger(__name__)

PASS_THRESHOLD = 0.6  # 得分 >= 此值视为「这道会写」，与 feedback_service 的正确率口径一致


@dataclass
class ShortAnswerGrade:
    score: float                                   # 0~1
    passed: bool                                   # score >= PASS_THRESHOLD
    covered: list[str] = field(default_factory=list)   # 答到的要点
    missing: list[str] = field(default_factory=list)   # 漏掉的要点
    errors: list[str] = field(default_factory=list)    # 说错/有误的地方
    diagnosis: str = ""                            # 一段话：思路断在哪
    follow_up: str = ""                            # 一条引导性追问（不直接给答案）
    offline: bool = False                          # True = LLM 不可用时的离线粗判

    def to_dict(self) -> dict[str, Any]:
        return {
            "score": round(self.score, 2),
            "passed": self.passed,
            "covered": self.covered,
            "missing": self.missing,
            "errors": self.errors,
            "diagnosis": self.diagnosis,
            "follow_up": self.follow_up,
            "offline": self.offline,
        }


_SYSTEM_PROMPT = (
    "你是 408（计算机学科专业基础综合）简答题阅卷老师。"
    "考生考的是「会不会写」，不是「有没有照抄参考答案」，所以只要意思对、要点到位就给分，"
    "措辞不同、顺序不同都不扣分。请按参考答案隐含的【得分要点】逐条核对考生答案，"
    "客观、就事论事，不鼓励空话。"
)

_TASK_PROMPT = """请批改下面这道简答题。

【题目】
{question}

【参考答案（作为得分要点的依据，不是唯一标准措辞）】
{expected}

【考生作答】
{answer}

请严格输出 JSON（不要任何额外文字、不要 markdown 代码块），字段如下：
{{
  "score": 0~1 的小数，按答到的得分要点占比给分（全对=1，完全跑题或空答=0），
  "covered": [考生答到的要点，简短中文短语],
  "missing": [考生漏掉的关键要点，简短中文短语],
  "errors": [考生答错或概念混淆的地方，没有就空数组],
  "diagnosis": "一段话(不超过80字)：直接点出考生思路断在哪一步、为什么没答全，像老师在旁边讲评",
  "follow_up": "一条引导性追问或提示(一句话)，帮考生自己想到漏掉的点，绝对不要直接把答案说出来"
}}"""


def _clamp01(x: Any) -> float:
    try:
        v = float(x)
    except (TypeError, ValueError):
        return 0.0
    return max(0.0, min(1.0, v))


def _as_str_list(x: Any) -> list[str]:
    if isinstance(x, list):
        return [str(i).strip() for i in x if str(i).strip()]
    if isinstance(x, str) and x.strip():
        return [x.strip()]
    return []


def _shingles(text: str) -> set[str]:
    """字符级 2-gram，用于离线粗判覆盖率（中文无需分词）。"""
    s = "".join(ch for ch in text if not ch.isspace())
    if len(s) < 2:
        return {s} if s else set()
    return {s[i:i + 2] for i in range(len(s) - 1)}


def _offline_grade(expected: str, answer: str) -> ShortAnswerGrade:
    """LLM 不可用时的降级：参考答案与作答的 2-gram 覆盖率。仅供参考，绝不抛错。"""
    if not answer.strip():
        return ShortAnswerGrade(score=0.0, passed=False, diagnosis="未作答。", offline=True)
    exp, ans = _shingles(expected), _shingles(answer)
    if not exp:
        # 没有参考答案可比，给个保守的中性分，避免误判为全错
        return ShortAnswerGrade(
            score=0.5, passed=False, offline=True,
            diagnosis="评分服务暂不可用，已离线粗判，建议联网后重新提交以获得逐点点评。",
        )
    coverage = len(exp & ans) / len(exp)
    return ShortAnswerGrade(
        score=round(coverage, 2),
        passed=coverage >= 0.5,
        offline=True,
        diagnosis="评分服务暂不可用，按与参考答案的文字覆盖率粗判，仅供参考。",
    )


async def grade_short_answer(
    question: str,
    expected_answer: str,
    user_answer: str,
    llm: Any | None = None,
) -> ShortAnswerGrade:
    """按 rubric 批改一道简答题。任何异常都降级为离线粗判，不向上抛。"""
    answer = (user_answer or "").strip()
    if not answer:
        return ShortAnswerGrade(score=0.0, passed=False, diagnosis="未作答。")

    if llm is None:
        try:
            from base.model_router import get_model_router

            llm, _ = get_model_router().for_task("chat")
        except Exception as exc:  # noqa: BLE001
            logger.warning("简答批改取 LLM 失败，转离线粗判：%s", exc)
            return _offline_grade(expected_answer, answer)

    messages = [
        SystemMessage(content=_SYSTEM_PROMPT),
        HumanMessage(content=_TASK_PROMPT.format(
            question=question or "（无题干）",
            expected=expected_answer or "（无参考答案，请就题目本身判断作答是否正确完整）",
            answer=answer,
        )),
    ]
    try:
        raw = await llm.ainvoke(messages)
        data = convert_json_output(get_text_from_response(raw))
    except Exception as exc:  # noqa: BLE001
        logger.warning("简答 LLM 批改失败，转离线粗判：%s", exc)
        return _offline_grade(expected_answer, answer)

    if not isinstance(data, dict):
        return _offline_grade(expected_answer, answer)

    score = _clamp01(data.get("score"))
    return ShortAnswerGrade(
        score=score,
        passed=score >= PASS_THRESHOLD,
        covered=_as_str_list(data.get("covered")),
        missing=_as_str_list(data.get("missing")),
        errors=_as_str_list(data.get("errors")),
        diagnosis=str(data.get("diagnosis") or "").strip(),
        follow_up=str(data.get("follow_up") or "").strip(),
    )
