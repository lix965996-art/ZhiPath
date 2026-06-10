"""LLM 调用重试装饰器：指数退避 + rate-limit/timeout 智能识别 + Tracer 集成。

不依赖 tenacity（避免新增依赖）—— 自己写 50 行轻量版，刚好够用。

策略：
- 最多 3 次重试（首次 + 2 次 retry）
- 指数退避：1s → 2s → 4s
- 只对**可重试错误**重试：超时、网络错误、429 rate limit、5xx
- 其他错误（认证失败、参数错误）立即抛出，不浪费时间
- 每次重试都向 Tracer 写一个 event，方便事后查
"""
from __future__ import annotations

import asyncio
import logging
import random
import re
from typing import Any, Callable, TypeVar

from services.tracing import span as tracing_span

logger = logging.getLogger(__name__)

T = TypeVar("T")

# 可重试错误的特征
_RETRYABLE_PATTERNS = [
    r"timeout",
    r"timed out",
    r"connection.*reset",
    r"connection.*refused",
    r"connection.*aborted",
    r"rate.?limit",
    r"too many requests",
    r"429",
    r"50[0-9].*\b(internal|bad gateway|service unavailable|gateway timeout)\b",
    r"503",
    r"504",
    r"network.*error",
    r"temporarily unavailable",
    r"server.*overloaded",
]


def is_retryable(exc: BaseException) -> bool:
    text = f"{type(exc).__name__}: {exc}".lower()
    for pat in _RETRYABLE_PATTERNS:
        if re.search(pat, text):
            return True
    # asyncio 超时
    if isinstance(exc, asyncio.TimeoutError):
        return True
    return False


async def with_retry_async(
    fn: Callable[..., Any],
    *args: Any,
    max_attempts: int = 3,
    base_delay: float = 1.0,
    op_name: str = "llm_call",
    **kwargs: Any,
) -> Any:
    """异步重试包装。`fn` 是 async callable。"""
    last_exc: BaseException | None = None
    with tracing_span(name=f"retry:{op_name}", kind="llm") as s:
        for attempt in range(1, max_attempts + 1):
            try:
                result = await fn(*args, **kwargs)
                s.attributes["attempts"] = attempt
                if attempt > 1:
                    s.attributes["retried"] = True
                return result
            except Exception as exc:
                last_exc = exc
                if not is_retryable(exc) or attempt == max_attempts:
                    s.status = "error"
                    s.error_message = f"final({attempt}): {exc}"[:240]
                    raise
                # jitter 防止雪崩
                delay = base_delay * (2 ** (attempt - 1)) + random.uniform(0, 0.3)
                logger.warning(
                    "LLM %s attempt %d/%d failed (%s), retrying in %.2fs",
                    op_name, attempt, max_attempts, exc, delay,
                )
                await asyncio.sleep(delay)
        # 不会走到这里
        raise last_exc  # type: ignore[misc]


def with_retry_sync(
    fn: Callable[..., T],
    *args: Any,
    max_attempts: int = 3,
    base_delay: float = 1.0,
    op_name: str = "llm_call",
    **kwargs: Any,
) -> T:
    """同步重试包装。"""
    import time

    last_exc: BaseException | None = None
    with tracing_span(name=f"retry:{op_name}", kind="llm") as s:
        for attempt in range(1, max_attempts + 1):
            try:
                result = fn(*args, **kwargs)
                s.attributes["attempts"] = attempt
                if attempt > 1:
                    s.attributes["retried"] = True
                return result
            except Exception as exc:
                last_exc = exc
                if not is_retryable(exc) or attempt == max_attempts:
                    s.status = "error"
                    s.error_message = f"final({attempt}): {exc}"[:240]
                    raise
                delay = base_delay * (2 ** (attempt - 1)) + random.uniform(0, 0.3)
                logger.warning(
                    "LLM %s sync attempt %d/%d failed (%s), retrying in %.2fs",
                    op_name, attempt, max_attempts, exc, delay,
                )
                time.sleep(delay)
        raise last_exc  # type: ignore[misc]
