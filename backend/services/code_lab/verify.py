"""学生程序输出与期望输出的比对。

判定逻辑：把学生 C 程序的实际 stdout 与 expected_output 做行级归一化后比较。
完全一致 → 逻辑通过；否则给出「期望 vs 实际」的行级 diff，方便学生定位。
"""
from __future__ import annotations

from dataclasses import dataclass


def normalize_output(text: str) -> list[str]:
    """归一化：按行拆分、去掉每行尾随空白、丢掉结尾空行。"""
    if not text:
        return []
    lines = [ln.rstrip("\r").rstrip() for ln in text.split("\n")]
    while lines and lines[-1] == "":
        lines.pop()
    return lines


@dataclass
class CompareResult:
    passed: bool
    diff: list[str]  # 给前端展示的行级 diff 文本；passed 时为空


def compare_outputs(expected: str, actual: str) -> CompareResult:
    e = normalize_output(expected)
    a = normalize_output(actual)
    if e == a:
        return CompareResult(passed=True, diff=[])

    # 简单行级对照：逐行显示 期望 / 实际，长度对齐补空。
    diff: list[str] = []
    n = max(len(e), len(a))
    for i in range(n):
        exp = e[i] if i < len(e) else "（无）"
        act = a[i] if i < len(a) else "（无）"
        flag = " " if exp == act else "✗"
        diff.append(f"{flag} 第{i + 1}行  期望「{exp}」  实际「{act}」")
    return CompareResult(passed=False, diff=diff)
