from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import Callable
from typing import Any

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from base.llm_factory import LLMFactory
from base.llm_retry import with_retry_async, with_retry_sync
from base.model_router import get_model_router
from capabilities.base import BaseCapability
from capabilities.engineering_trace import emit_engineering_trace
from core.context import UnifiedContext
from core.stream_bus import StreamBus

logger = logging.getLogger(__name__)

LLM_STREAM_TIMEOUT = 120


class PromptedLLMCapability(BaseCapability):
    """系统提示 + 记忆/RAG + 历史 + 当前句 → 流式 LLM。

    子类如 resource_gen 可先跑工具再把 agent JSON 注入 messages（见 _run_llm_with_agent_context）。

    多模型路由：子类可设置 `route_task = "chat" | "structured" | "long_form" | "reasoning" | "code" | "mermaid"`
    让全局 ModelRouter 自动按任务类型选最合适的模型，并带 fallback 链。
    """

    system_prompt: str = ""
    stage_name: str = "responding"
    llm_profile: str | None = None  # 显式指定 profile（最高优先级）
    route_task: str | None = None  # ModelRouter 任务标签

    def _resolve_llm(self, stream: StreamBus | None = None):
        if self.llm_profile:
            return LLMFactory.from_profile(self.llm_profile)
        if self.route_task:
            router = get_model_router()
            model, picked = router.for_task(self.route_task)
            if stream is not None:
                stream.thinking(f"ModelRouter 为 {self.name} 任务 {self.route_task} 选择: {picked}")
            return model
        return LLMFactory.from_profile(None)

    async def run(self, context: UnifiedContext, stream: StreamBus) -> None:
        llm = self._resolve_llm(stream)
        messages = self._build_messages(context)

        emit_engineering_trace(stream, context, self.name)

        async with stream.stage(self.stage_name):
            try:
                await asyncio.wait_for(
                    self._stream_llm_response(llm, messages, stream),
                    timeout=LLM_STREAM_TIMEOUT,
                )
            except asyncio.TimeoutError:
                logger.error("LLM streaming timed out after %ds", LLM_STREAM_TIMEOUT)
                stream.error(f"响应超时（{LLM_STREAM_TIMEOUT} 秒），请重试")
            except Exception as exc:
                logger.error("LLM streaming failed: %s", exc, exc_info=True)
                stream.error(f"AI 响应失败: {exc}")

    def _build_messages(self, context: UnifiedContext) -> list[Any]:
        messages: list[Any] = [SystemMessage(content=self.system_prompt)]

        if context.memory_context:
            messages.append(
                SystemMessage(
                    content=f"学习者长期记忆和画像信息：\n{context.memory_context}",
                ),
            )

        if context.knowledge_context:
            messages.append(
                SystemMessage(
                    content=f"可参考的课程知识上下文：\n{context.knowledge_context}",
                ),
            )

        for msg in context.conversation_history[-10:]:
            if msg.get("role") == "user":
                messages.append(HumanMessage(content=msg.get("content", "")))
            elif msg.get("role") == "assistant":
                messages.append(AIMessage(content=msg.get("content", "")))

        messages.append(HumanMessage(content=context.user_message))
        return messages

    @staticmethod
    def _chunk_text(content: Any) -> str:
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            parts: list[str] = []
            for item in content:
                if isinstance(item, str):
                    parts.append(item)
                elif isinstance(item, dict):
                    value = item.get("text") or item.get("content") or ""
                    if isinstance(value, str):
                        parts.append(value)
            return "".join(parts)
        return str(content) if content is not None else ""

    async def _stream_llm_response(
        self,
        llm: Any,
        messages: list[Any],
        stream: StreamBus,
    ) -> None:
        """Stream LLM chunks with Python 3.10 compatible timeout handling."""
        async for chunk in llm.astream(messages):
            text = self._chunk_text(chunk.content)
            if text:
                stream.content(text, source=self.name)

    # ------------------------------------------------------------------
    # Agent integration helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _emit_agent_message(
        stream: StreamBus,
        from_agent: str,
        to_agent: str,
        payload: Any,
        label: str = "",
    ) -> None:
        """便捷封装：从能力层 emit 多智能体通信事件给前端工作流图。"""
        if isinstance(payload, (dict, list, str)):
            normalized = payload
        else:
            normalized = str(payload)
        stream.agent_message(
            from_agent=from_agent,
            to_agent=to_agent,
            payload=normalized,
            label=label,
        )

    async def _invoke_agent(
        self,
        agent_name: str,
        agent_fn: Callable[..., Any],
        stream: StreamBus,
        **kwargs: Any,
    ) -> Any | None:
        """Call a module-layer agent with StreamBus feedback, tracing and error handling."""
        from services.tracing import span as tracing_span

        input_summary = "; ".join(f"{k}={str(v)[:80]}" for k, v in kwargs.items())[:300]
        stream.tool_call(agent_name, input_summary=input_summary)
        stream.thinking(f"正在调用 {agent_name} ...")
        with tracing_span(
            name=agent_name,
            kind="agent",
            attributes={
                "capability": self.name,
                "input_summary": input_summary[:200],
            },
        ) as s:
            try:
                # 用 retry 包：rate_limit/timeout 等可重试错误自动指数退避 3 次
                def _run():
                    return agent_fn(**kwargs)

                result = await asyncio.to_thread(
                    with_retry_sync,
                    _run,
                    max_attempts=3,
                    base_delay=1.0,
                    op_name=agent_name,
                )
                output_summary = json.dumps(result, ensure_ascii=False)[:200] if result else ""
                stream.tool_result(agent_name, output_summary=output_summary, status="success")
                stream.thinking(f"{agent_name} 完成。")
                s.attributes["output_summary"] = output_summary
                return result
            except Exception as exc:
                stream.tool_result(agent_name, output_summary=str(exc)[:200], status="error")
                logger.warning("Agent %s failed after retries, degrading gracefully: %s", agent_name, exc)
                stream.thinking(f"{agent_name} 调用失败（已重试），将使用纯 LLM 模式继续。")
                s.status = "error"
                s.error_message = str(exc)[:300]
                return None

    @staticmethod
    def _build_agent_context_message(agent_results: dict[str, Any]) -> str | None:
        """Format agent results into a context string for LLM injection."""
        if not agent_results:
            return None
        sections: list[str] = []
        for name, data in agent_results.items():
            if data is not None:
                sections.append(f"### {name}\n{json.dumps(data, ensure_ascii=False, indent=2)}")
        if not sections:
            return None
        return "以下是结构化分析工具的输出结果，请基于这些数据组织你的回答：\n\n" + "\n\n".join(sections)

    async def _run_llm_with_agent_context(
        self,
        context: UnifiedContext,
        stream: StreamBus,
        agent_results: dict[str, Any],
    ) -> None:
        """Run LLM streaming with agent results injected as context."""
        llm = self._resolve_llm(stream)
        messages = self._build_messages(context)

        agent_context_text = self._build_agent_context_message(agent_results)
        if agent_context_text:
            insert_pos = len(messages) - 1
            messages.insert(insert_pos, SystemMessage(content=agent_context_text))

        emit_engineering_trace(stream, context, self.name)

        async with stream.stage(self.stage_name):
            try:
                await asyncio.wait_for(
                    self._stream_llm_response(llm, messages, stream),
                    timeout=LLM_STREAM_TIMEOUT,
                )
            except asyncio.TimeoutError:
                logger.error("LLM streaming timed out after %ds", LLM_STREAM_TIMEOUT)
                stream.error(f"响应超时（{LLM_STREAM_TIMEOUT} 秒），请重试")
            except Exception as exc:
                logger.error("LLM streaming failed: %s", exc, exc_info=True)
                stream.error(f"AI 响应失败: {exc}")
