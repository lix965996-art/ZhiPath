"""内容安全过滤：本地词典级别的快速检测，覆盖输入 + 输出。

赛题非功能需求第 3 条要求"无敏感违规信息"。本模块只做**最小可用**护栏：
1. 涉政 / 暴恐 / 色情 关键词
2. 提示词注入常见关键字 (jailbreak / 越权)
3. 学术不端高频用语（保留但记录，仅给出 warning）

若集成讯飞内容审核 API 凭据 (XF_AUDIT_*)，扩展点已在 `_remote_check()` 注释中标出。
"""
from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass
class ContentSafetyResult:
    safe: bool
    severity: str  # "ok" | "warning" | "block"
    reason: str = ""
    matched: list[str] = None  # type: ignore[assignment]

    def to_dict(self) -> dict:
        return {
            "safe": self.safe,
            "severity": self.severity,
            "reason": self.reason,
            "matched": self.matched or [],
        }


_BLOCK_PATTERNS = [
    r"颠覆国家政权",
    r"煽动暴力",
    r"自杀指南",
    r"制造\s*炸药",
    r"未成年.*色情",
    r"ignore (the )?(above|previous) (instructions|prompts)",
    r"jailbreak\s*mode",
]

_WARN_PATTERNS = [
    r"抄袭",
    r"代写",
    r"考试作弊",
    r"找枪手",
]


def check_content_safety(text: str) -> ContentSafetyResult:
    """对给定文本做本地正则级安全检查。

    block：直接拒绝；warning：可放行但前端会展示安全提示；ok：放行。
    """
    if not text or not text.strip():
        return ContentSafetyResult(safe=True, severity="ok", matched=[])

    lowered = text.lower()
    block_hits = [p for p in _BLOCK_PATTERNS if re.search(p, lowered)]
    if block_hits:
        return ContentSafetyResult(
            safe=False,
            severity="block",
            reason="命中安全策略",
            matched=block_hits,
        )

    warn_hits = [p for p in _WARN_PATTERNS if re.search(p, lowered)]
    if warn_hits:
        return ContentSafetyResult(
            safe=True,
            severity="warning",
            reason="命中学术诚信策略",
            matched=warn_hits,
        )

    return ContentSafetyResult(safe=True, severity="ok", matched=[])


# 扩展点：若引入讯飞内容审核（基于 XF_AUDIT_APPID/APIKEY/APISECRET）
# 实现 _remote_check(text) → ContentSafetyResult 并在 check_content_safety 顶层调用即可。
