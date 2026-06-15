"""多模型智能路由（简化版）：优先使用用户配置，回退到 yaml 默认 profile。

路由逻辑：
1. 先查用户在前端配置的 ApiConfig（按任务类型匹配）
2. 回退到 config/default.yaml 中定义的 profile
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Callable

from base.credential_context import get_any_enabled_config, get_config_for_task
from base.llm_factory import LLMFactory

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
    """全局路由实例：暴露 `for_task(name) → (BaseChatModel, profile_name)` 单点入口。"""

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
            }
            for r in self.routes.values()
        ]

    def for_task(
        self,
        task: str,
        override: str | None = None,
        on_select: Callable[[str], None] | None = None,
    ):
        """返回 (BaseChatModel, profile_name)。

        优先级：
        1. 用户在前端配置的 ApiConfig（按 task 类型匹配）
        2. override 指定的 profile
        3. yaml 路由表中的 primary → fallbacks
        """
        # ── 1. 用户配置优先 ──
        user_config = get_config_for_task(task)
        if user_config:
            try:
                model = LLMFactory.from_api_config(user_config)
                label = f"user:{user_config.name or user_config.id}"
                self._log(task, label, "user_config", True)
                if on_select:
                    on_select(label)
                return model, label
            except Exception as exc:
                logger.warning("User config for task %s failed: %s; falling back", task, exc)
                self._log(task, "user_config", f"user_config_error:{exc!s}"[:80], False)

        # ── 2. 兜底：任意一个用户配置 ──
        any_config = get_any_enabled_config()
        if any_config:
            try:
                model = LLMFactory.from_api_config(any_config)
                label = f"user:{any_config.name or any_config.id}"
                self._log(task, label, "any_user_config", True)
                if on_select:
                    on_select(label)
                return model, label
            except Exception as exc:
                logger.warning("Any user config failed: %s; falling back to yaml", exc)
                self._log(task, "any_user_config", f"error:{exc!s}"[:80], False)

        # ── 3. override profile ──
        if override:
            try:
                model = LLMFactory.from_profile(override)
                self._log(task, override, "override", True)
                if on_select:
                    on_select(override)
                return model, override
            except Exception as exc:
                logger.warning("Router override %s failed: %s; trying defaults", override, exc)

        # ── 4. yaml 路由表 ──
        route = self.routes.get(task)
        if route is None:
            from config.loader import get_config
            cfg = get_config()
            default = cfg.llm.default_profile
            model = LLMFactory.from_profile(default)
            self._log(task, default, "unknown_task_fallback", True)
            if on_select:
                on_select(default)
            return model, default

        for candidate in [route.primary, *route.fallbacks]:
            try:
                model = LLMFactory.from_profile(candidate)
                self._log(task, candidate, "yaml_selected", True)
                if on_select:
                    on_select(candidate)
                return model, candidate
            except Exception as exc:
                logger.warning("Router %s candidate %s failed: %s", task, candidate, exc)
                self._log(task, candidate, f"error:{exc!s}"[:80], False)
                continue

        # 最终兜底
        from config.loader import get_config
        cfg = get_config()
        default = cfg.llm.default_profile
        model = LLMFactory.from_profile(default)
        self._log(task, default, "ultimate_fallback", True)
        if on_select:
            on_select(default)
        return model, default

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
