"""内容安全过滤：本地词典级快速检测 + 可选讯飞内容审核远程兜底，覆盖输入与输出。

赛题非功能需求第 3 条："系统需具备完善的'防幻觉'与内容安全过滤机制，
确保生成的学术内容无事实性错误、无敏感违规信息。"

两层防护：
1. 本地正则词典（同步、零依赖、永远可用）：涉政/暴恐/色情/违法/隐私/自残/
   提示词注入 → block；学术不端 → warning。
2. 讯飞内容审核 API（异步、可选、缺凭据或失败时优雅降级）：
   设置 XF_AUDIT_APPID/XF_AUDIT_API_KEY/XF_AUDIT_API_SECRET 且 XF_AUDIT_ENABLED=1
   时启用，对本地放行的文本再做一次合规复核。

调用方：
- 同步快路径：`check_content_safety(text)` —— 仅本地，给老调用点用。
- 异步全路径：`await audit_text(text, stage=...)` —— 本地 + 远程，输入/输出都走它。
"""
from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import logging
import os
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from email.utils import format_datetime

logger = logging.getLogger(__name__)


@dataclass
class ContentSafetyResult:
    safe: bool
    severity: str  # "ok" | "warning" | "block"
    reason: str = ""
    matched: list[str] = None  # type: ignore[assignment]
    source: str = "local"  # "local" | "iflytek" | "local+iflytek"

    def to_dict(self) -> dict:
        return {
            "safe": self.safe,
            "severity": self.severity,
            "reason": self.reason,
            "matched": self.matched or [],
            "source": self.source,
        }


# ── 本地词典：按类别组织，便于审计与扩展。命中任一类即 block。 ──
# 注意：模式需足够具体，避免误伤正常学术词（如"死锁""哈希碰撞""注入攻击"教学讨论）。
_BLOCK_CATEGORIES: dict[str, list[str]] = {
    "涉政颠覆": [
        r"颠覆国家政权",
        r"推翻\s*(党|政府|国家)",
        r"煽动\s*(颠覆|分裂|叛乱)",
        r"分裂国家",
    ],
    "暴恐违法": [
        r"煽动暴力",
        r"制造\s*(炸药|炸弹|爆炸物)",
        r"制\s*枪",
        r"恐怖袭击\s*(教程|步骤|方法)",
        r"(购买|贩卖|制造)\s*(毒品|冰毒|海洛因)",
    ],
    "色情低俗": [
        r"未成年.*色情",
        r"儿童\s*色情",
        r"淫秽\s*(视频|图片|内容)\s*(下载|购买)",
    ],
    "自残自杀": [
        r"自杀\s*(指南|教程|方法|攻略)",
        r"无痛\s*自杀",
    ],
    "提示词注入": [
        r"ignore (the )?(above|previous) (instructions|prompts)",
        r"忽略(上面|之前|以上)的?\s*(指令|提示|规则|设定)",
        r"jailbreak\s*mode",
        r"开发者模式\s*(开启|启用)",
        r"泄露\s*(你的)?\s*(系统提示|system prompt)",
    ],
}

# warning 级：放行但标记（学术诚信）。
_WARN_PATTERNS = [
    r"抄袭",
    r"代写",
    r"考试作弊",
    r"找枪手",
    r"论文\s*代\s*写",
]

# 预编译
_BLOCK_COMPILED: list[tuple[str, re.Pattern[str]]] = [
    (cat, re.compile(p, re.IGNORECASE))
    for cat, patterns in _BLOCK_CATEGORIES.items()
    for p in patterns
]
_WARN_COMPILED = [re.compile(p, re.IGNORECASE) for p in _WARN_PATTERNS]


def check_content_safety(text: str) -> ContentSafetyResult:
    """本地正则级安全检查（同步、零依赖）。

    block：直接拒绝；warning：放行但前端展示提示；ok：放行。
    """
    if not text or not text.strip():
        return ContentSafetyResult(safe=True, severity="ok", matched=[])

    block_hits = [pat.pattern for cat, pat in _BLOCK_COMPILED if pat.search(text)]
    if block_hits:
        cats = sorted({cat for cat, pat in _BLOCK_COMPILED if pat.search(text)})
        return ContentSafetyResult(
            safe=False,
            severity="block",
            reason="命中内容安全策略：" + "、".join(cats),
            matched=block_hits,
        )

    warn_hits = [pat.pattern for pat in _WARN_COMPILED if pat.search(text)]
    if warn_hits:
        return ContentSafetyResult(
            safe=True,
            severity="warning",
            reason="命中学术诚信策略",
            matched=warn_hits,
        )

    return ContentSafetyResult(safe=True, severity="ok", matched=[])


async def audit_text(text: str, *, stage: str = "input") -> ContentSafetyResult:
    """全路径审核：本地优先，本地放行后再走讯飞远程复核（可选）。

    stage 仅用于日志区分（input / output）。任何远程异常都降级为本地结果。
    """
    local = check_content_safety(text)
    if not local.safe:
        return local  # 本地已拦截，无需远程

    if not _remote_enabled():
        return local

    try:
        remote = await asyncio.wait_for(_remote_audit(text), timeout=3.0)
    except Exception as exc:  # 网络/鉴权/超时一律降级
        logger.warning("讯飞内容审核(%s)失败，降级本地结果: %s", stage, exc)
        return local

    if remote is None:
        return local
    if not remote.safe:
        remote.source = "iflytek"
        return remote
    # 远程也放行：合并来源标记，保留本地 warning（若有）
    local.source = "local+iflytek"
    return local


def _remote_enabled() -> bool:
    return (
        os.getenv("XF_AUDIT_ENABLED") == "1"
        and bool(os.getenv("XF_AUDIT_APPID"))
        and bool(os.getenv("XF_AUDIT_API_KEY"))
        and bool(os.getenv("XF_AUDIT_API_SECRET"))
    )


async def _remote_audit(text: str) -> ContentSafetyResult | None:
    """调用讯飞内容审核(文本合规) WebAPI。

    采用讯飞 WebAPI 通用 HMAC-SHA256 鉴权（host/date/request-line 签名）。
    返回 None 表示无法判定（交由本地结果兜底）。

    说明：endpoint host/path 需与所开通的讯飞「文本合规」服务一致，
    默认指向 audit.iflyaisol.com；如开通的是其它接入点请改 XF_AUDIT_HOST。
    """
    import json

    import httpx

    appid = os.environ["XF_AUDIT_APPID"]
    api_key = os.environ["XF_AUDIT_API_KEY"]
    api_secret = os.environ["XF_AUDIT_API_SECRET"]
    host = os.getenv("XF_AUDIT_HOST", "audit.iflyaisol.com")
    path = os.getenv("XF_AUDIT_PATH", "/audit/v2/syncText")

    date = format_datetime(datetime.now(timezone.utc), usegmt=True)
    request_line = f"POST {path} HTTP/1.1"
    signature_origin = f"host: {host}\ndate: {date}\n{request_line}"
    signature = base64.b64encode(
        hmac.new(api_secret.encode(), signature_origin.encode(), hashlib.sha256).digest()
    ).decode()
    authorization_origin = (
        f'api_key="{api_key}", algorithm="hmac-sha256", '
        f'headers="host date request-line", signature="{signature}"'
    )
    authorization = base64.b64encode(authorization_origin.encode()).decode()

    url = f"https://{host}{path}?authorization={authorization}&host={host}&date={date.replace(' ', '%20')}"
    payload = {"appId": appid, "content": text[:2000]}

    async with httpx.AsyncClient() as client:
        resp = await client.post(url, json=payload, timeout=3.0)
        resp.raise_for_status()
        data: dict = resp.json()

    # 讯飞合规返回里 suggestion=block/review 表示命中。字段名按实际服务为准。
    suggestion = str(
        data.get("suggestion")
        or (data.get("data") or {}).get("suggestion")
        or "pass"
    ).lower()
    if suggestion in {"block", "reject", "fail"}:
        return ContentSafetyResult(
            safe=False,
            severity="block",
            reason="讯飞内容审核判定违规",
            matched=[],
            source="iflytek",
        )
    if suggestion in {"review", "warn"}:
        return ContentSafetyResult(
            safe=True,
            severity="warning",
            reason="讯飞内容审核建议人工复核",
            matched=[],
            source="iflytek",
        )
    return ContentSafetyResult(safe=True, severity="ok", matched=[], source="iflytek")
