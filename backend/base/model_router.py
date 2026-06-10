"""多模型智能路由：按任务类型 + 复杂度自动选最合适的 LLM profile。

设计目标：
- 简单对话 → 快/便宜的小模型（讯飞星火 Lite / Kimi K2.5）
- 结构化输出 (JSON Schema)：DeepSeek Pro / Kimi K2.6（指令跟随好）
- 长文创作（讲义）：DeepSeek Pro
- 反思/规划：DeepSeek Pro（高 reasoning）
- 代码生成：DeepSeek Pro（代码强）
- 图表/Mermaid：可用任何指令跟随强的模型

每个任务有：
- primary (首选)
- fallback (主用不可用时降级链)
- 实际可用模型 = LLM profile 在 env 中能拿到 api_key 的那些

带 fallback 链：如果首选不可用（API key 缺失/调用失败），自动尝试 fallback。
这是工程化的体现 — 不是死写一个模型而是按需路由。
"""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from typing import Any, Callable

from base.credential_context import get_credential
from base.llm_factory import LLMFactory
from config.loader import get_config

logger = logging.getLogger(__name__)


@dataclass
class TaskRoute:
    name: str
    primary: str
    fallbacks: list[str] = field(default_factory=list)
    description: str = ""


# 任务名 → 模型路由表（profile 名必须与 config/default.yaml 中已定义的对应）
_DEFAULT_ROUTES: dict[str, TaskRoute] = {
    "chat": TaskRoute(
        name="chat",
        primary="deepseek-chat",
        fallbacks=["qwen-turbo", "qwen2.5-7b", "iflytek-spark-lite"],
        description="日常导学对话，需要快和便宜",
    ),
    "structured": TaskRoute(
        name="structured",
        primary="deepseek-chat",
        fallbacks=["qwen-plus", "deepseek-v3-sf", "glm-4-9b"],
        description="结构化 JSON 输出（quiz、flashcard、mermaid 等）",
    ),
    "long_form": TaskRoute(
        name="long_form",
        primary="deepseek-chat",
        fallbacks=["qwen-max", "qwen-plus", "deepseek-v3-sf"],
        description="微讲义、长答案、报告类长文输出",
    ),
    "reasoning": TaskRoute(
        name="reasoning",
        primary="deepseek-reasoner",
        fallbacks=["deepseek-chat", "qwen-max", "deepseek-v3-sf"],
        description="目标诊断、技能差距、闭环报告：要 reasoning",
    ),
    "code": TaskRoute(
        name="code",
        primary="deepseek-chat",
        fallbacks=["qwen-plus", "deepseek-v3-sf", "qwen2.5-7b"],
        description="CodeLab 等需要代码合成的任务",
    ),
    "mermaid": TaskRoute(
        name="mermaid",
        primary="deepseek-chat",
        fallbacks=["qwen-plus", "iflytek-spark-pro", "glm-4-9b"],
        description="Mermaid / 流程图，对语法严格性要求高",
    ),
}


class ModelRouter:
    """全局路由实例：暴露 `for_task(name) → BaseChatModel` 单点入口。"""

    def __init__(self, routes: dict[str, TaskRoute] | None = None) -> None:
        self.routes = routes or _DEFAULT_ROUTES
        self.routing_log: list[dict[str, Any]] = []

    def list_routes(self) -> list[dict[str, Any]]:
        return [
            {
                "name": r.name,
                "primary": r.primary,
                "fallbacks": list(r.fallbacks),
                "description": r.description,
                "primary_available": self._profile_available(r.primary),
            }
            for r in self.routes.values()
        ]

    def for_task(
        self,
        task: str,
        override: str | None = None,
        on_select: Callable[[str], None] | None = None,
    ):
        """返回 (BaseChatModel, profile_name)。"""
        # ── 优先检查自定义 LLM 端点 ──
        custom_base_url = os.environ.get("CUSTOM_LLM_BASE_URL", "")
        if custom_base_url:
            try:
                custom_model_name = os.environ.get("CUSTOM_LLM_MODEL", "")
                custom_api_key = os.environ.get("CUSTOM_LLM_API_KEY", "")
                custom_api_format = os.environ.get("CUSTOM_LLM_API_FORMAT", "openai")

                # 根据 api_format 决定 langchain model_provider
                model_provider = {
                    "openai": "openai",
                    "anthropic": "anthropic",
                    "custom": "openai",
                }.get(custom_api_format, "openai")

                # 构建 LLM 配置
                create_kwargs: dict[str, Any] = {
                    "model": custom_model_name or ("claude-sonnet-4-20250514" if model_provider == "anthropic" else "default"),
                    "model_provider": model_provider,
                    "temperature": 0,
                }
                if custom_api_key:
                    create_kwargs["api_key"] = custom_api_key
                # Anthropic 也支持自定义 base_url（中转站）
                if model_provider == "anthropic" and custom_base_url:
                    create_kwargs["base_url"] = custom_base_url

                model = LLMFactory.create(**create_kwargs)
                self._log(task, f"custom:{custom_base_url}", "custom_endpoint", True)
                if on_select:
                    on_select("custom")
                return model, "custom"
            except Exception as exc:
                logger.warning("Custom LLM endpoint failed: %s; falling back to built-in router", exc)
                self._log(task, "custom", f"custom_error:{exc!s}"[:80], False)

        if override:
            try:
                model = LLMFactory.from_profile(override)
                self._log(task, override, "override", True)
                if on_select:
                    on_select(override)
                return model, override
            except Exception as exc:
                logger.warning("Router override %s failed: %s; trying defaults", override, exc)

        route = self.routes.get(task)
        if route is None:
            cfg = get_config()
            default = cfg.llm.default_profile
            model = LLMFactory.from_profile(default)
            self._log(task, default, "unknown_task", True)
            if on_select:
                on_select(default)
            return model, default

        attempted: list[str] = []
        for candidate in [route.primary, *route.fallbacks]:
            attempted.append(candidate)
            if not self._profile_available(candidate):
                self._log(task, candidate, "skipped_no_key", False)
                continue
            try:
                model = LLMFactory.from_profile(candidate)
                self._log(task, candidate, "selected", True)
                if on_select:
                    on_select(candidate)
                return model, candidate
            except Exception as exc:
                logger.warning("Router %s candidate %s failed: %s", task, candidate, exc)
                self._log(task, candidate, f"error:{exc!s}"[:80], False)
                continue

        # 最后兜底：默认 profile（不带可用性检查；保证总有 LLM 实例返回）
        cfg = get_config()
        default = cfg.llm.default_profile
        model = LLMFactory.from_profile(default)
        self._log(task, default, "ultimate_fallback", True)
        if on_select:
            on_select(default)
        return model, default

    def _profile_available(self, profile_name: str) -> bool:
        cfg = get_config()
        profile = cfg.llm.profiles.get(profile_name)
        if profile is None:
            return False
        env = profile.api_key_env
        # 没显式 api_key_env 的 profile（如 deepseek）走 provider 默认
        if not env:
            return any(
                get_credential(k) for k in ("DEEPSEEK_API_KEY", "OPENAI_API_KEY")
            )
        return bool(get_credential(env))

    def _log(self, task: str, profile: str, reason: str, success: bool) -> None:
        self.routing_log.append({
            "task": task,
            "profile": profile,
            "reason": reason,
            "success": success,
        })
        if len(self.routing_log) > 200:
            self.routing_log = self.routing_log[-200:]


_router: ModelRouter | None = None


def get_model_router() -> ModelRouter:
    global _router
    if _router is None:
        _router = ModelRouter()
    return _router
