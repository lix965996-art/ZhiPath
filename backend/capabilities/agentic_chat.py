"""AgenticChatCapability：LLM 自主决定调用什么工具。

设计取舍（区别于 IMPROVEMENT_PLAN.md 原方案）：
1. **不替换 ChatCapability**。原 chat 作为 fast path 保留——闲聊不需要 tool calling 的额外延迟。
   新增的能力名为 "agentic"（前端 "auto" pill 路由到这里）。
2. **工具复用现有 capability**。已有 6 个能力 + KG / BKT / FSRS 查询，本身就是工具集，
   不再为 quiz/flashcard/mindmap 写一遍 wrapper。
3. **工具调用结果自动 emit `agent_message` + `tool_call/result`**，复用现有可视化
   （AgentMessageFeed / AgentWorkflowGraph），不再写 ToolCallIndicator。
4. **带 ReAct fallback**：若 LLM 不返回 tool_calls（比如部分国产模型 function calling 不稳），
   解析自由文本中的 `{"tool": ..., "args": ...}` JSON 块走兜底路径。

参考文献：ReAct (Yao et al. 2023)、Toolformer (Schick et al. 2023)、AgenticChat 模式
（DeepTutor 也用，但 DeepTutor 用 OpenAI 原生 SDK，我们用 LangChain bind_tools，省一层依赖）。
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any, Awaitable, Callable

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage

from capabilities.base import CapabilityManifest
from capabilities.llm_capability import PromptedLLMCapability
from core.context import UnifiedContext
from core.stream_bus import StreamBus
from services.knowledge_graph import KnowledgeGraph
from services.mastery import MasteryStore
from services.srs import ReviewStore
from services.tracing import span as tracing_span

logger = logging.getLogger(__name__)

MAX_TOOL_ITERATIONS = 4
MAX_PARALLEL_TOOLS = 4


SYSTEM_PROMPT = """你是 ZhiPath 的"智能路由"导师（Agentic Tutor）。
你被赋予一组工具，**自主**决定何时调用它们。

调用原则：
1. **能直接回答就直接回答**（闲聊、概念解释、简单建议），不要乱调工具。
2. 用户**明确说要做题/出题/试卷** → call `route_to_resource_gen`
3. 用户**对学情/掌握度/薄弱点好奇** → call `query_mastery`
4. 用户**问"该复习什么"/"今天复习啥"** → call `query_due_cards`
5. 用户**问"我学过什么"/"接下来学什么"** → call `query_knowledge_graph` + `query_mastery`
6. 用户**学习目标模糊** → call `route_to_goal`
7. 用户**要一个完整学习循环** → call `route_to_auto_tutor`
8. 工具结果回来后，**用中文总结给学生**，引用工具结果但不要原样贴 JSON。
9. 一轮最多调 3 个工具，不要无限套娃。

输出：直接对学生说话，所有工具调用对学生透明（不要解释"我先调用了 XX 工具"）。
"""


# ---- Tool 定义 ----

def _route_capability(name: str) -> dict[str, Any]:
    return {
        "type": "function",
        "function": {
            "name": f"route_to_{name}",
            "description": _ROUTE_DESCRIPTIONS[name],
            "parameters": {
                "type": "object",
                "properties": {
                    "user_intent": {
                        "type": "string",
                        "description": "用一句话改写学生的本轮意图，作为该 capability 的输入",
                    },
                },
                "required": ["user_intent"],
            },
        },
    }


_ROUTE_DESCRIPTIONS = {
    "goal": "走目标诊断 capability：拆解学习目标 + 技能差距分析，适合用户描述模糊的『想学 X』场景",
    "learning": "走学习路径 capability：根据画像生成 5 阶段学习计划",
    "resource_gen": "走资源生成 capability：并行产出讲义+测验+闪卡+思维导图+代码沙箱+Mermaid图+音频",
    "auto_tutor": "走 Auto-Tutor 闭环：诊断→生成→自评→画像更新→重规划 一站式完整闭环",
    "debate": "走多智能体辩论：对『X vs Y 哪种学法更好』类问题，3 角色 2 轮辩论得结论",
}


def _build_tool_schemas() -> list[dict[str, Any]]:
    return [
        _route_capability("goal"),
        _route_capability("learning"),
        _route_capability("resource_gen"),
        _route_capability("auto_tutor"),
        _route_capability("debate"),
        {
            "type": "function",
            "function": {
                "name": "query_mastery",
                "description": "查询当前学生 BKT 掌握度快照 + 薄弱知识点 TOP",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "limit": {"type": "integer", "description": "返回 TOP 几个，默认 5"},
                    },
                    "required": [],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "query_due_cards",
                "description": "查询当前到期的 FSRS 复习卡片",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "limit": {"type": "integer", "description": "最多返回几张，默认 10"},
                    },
                    "required": [],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "query_knowledge_graph",
                "description": "查询当前学习者的知识图谱节点 + 前后置依赖 + 推荐下一步",
                "parameters": {"type": "object", "properties": {}, "required": []},
            },
        },
    ]


class AgenticChatCapability(PromptedLLMCapability):
    """LLM 自主工具调用。复用现有 capability registry 作为工具源。"""

    manifest = CapabilityManifest(
        name="agentic",
        description="智能路由：LLM 自主决定何时调用其他能力或查询学情",
        stages=["thinking", "acting", "responding"],
        tools_used=[
            "route_to_goal",
            "route_to_learning",
            "route_to_resource_gen",
            "route_to_auto_tutor",
            "route_to_debate",
            "query_mastery",
            "query_due_cards",
            "query_knowledge_graph",
        ],
    )
    system_prompt = SYSTEM_PROMPT
    stage_name = "agentic_chat"
    route_task = "reasoning"

    async def run(self, context: UnifiedContext, stream: StreamBus) -> None:
        llm = self._resolve_llm(stream)
        try:
            llm_with_tools = llm.bind_tools(_build_tool_schemas())
        except Exception as exc:
            # LLM provider 不支持 bind_tools → 走 ReAct fallback
            stream.thinking(f"模型不支持 native function calling，走 ReAct 兜底：{exc}")
            return await self._react_fallback(llm, context, stream)

        messages = self._build_messages(context)
        async with stream.stage("agentic_chat"):
            await self._tool_loop(llm_with_tools, messages, context, stream)

    async def _tool_loop(
        self,
        llm: Any,
        messages: list,
        context: UnifiedContext,
        stream: StreamBus,
    ) -> None:
        for iteration in range(MAX_TOOL_ITERATIONS):
            try:
                ai_msg: AIMessage = await llm.ainvoke(messages)
            except Exception as exc:
                stream.error(f"Agentic LLM 调用失败: {exc}")
                return

            tool_calls = getattr(ai_msg, "tool_calls", None) or []

            # 没有 tool_calls → 直接流式输出最终文本
            if not tool_calls:
                await self._stream_final(llm, messages, stream)
                return

            messages.append(ai_msg)
            stream.thinking(f"Agentic 第 {iteration + 1} 轮：调用 {len(tool_calls)} 个工具")
            for tc in tool_calls[:MAX_PARALLEL_TOOLS]:
                self._emit_agent_message(
                    stream,
                    "AgenticChat",
                    tc.get("name", "?"),
                    tc.get("args", {}),
                    label="工具调用",
                )

            # 并行执行工具
            tasks = [
                self._exec_tool(tc, context, stream)
                for tc in tool_calls[:MAX_PARALLEL_TOOLS]
            ]
            results = await asyncio.gather(*tasks, return_exceptions=True)

            # 把结果回填进消息
            for tc, result in zip(tool_calls, results):
                if isinstance(result, Exception):
                    content = json.dumps({"error": str(result)[:200]}, ensure_ascii=False)
                else:
                    content = json.dumps(result, ensure_ascii=False)[:1500]
                messages.append(ToolMessage(
                    content=content,
                    tool_call_id=tc.get("id") or tc.get("name", ""),
                ))

        # 超过最大轮次，强制总结
        stream.thinking(f"已达 {MAX_TOOL_ITERATIONS} 轮上限，强制总结")
        await self._stream_final(llm, messages, stream)

    async def _exec_tool(
        self,
        tool_call: dict[str, Any],
        context: UnifiedContext,
        stream: StreamBus,
    ) -> dict[str, Any]:
        name = tool_call.get("name", "")
        args = tool_call.get("args", {}) or {}
        stream.tool_call(name, input_summary=json.dumps(args, ensure_ascii=False)[:160])

        with tracing_span(
            name=f"agentic_tool:{name}",
            kind="tool",
            attributes={"args": str(args)[:200]},
        ) as s:
            try:
                result = await self._dispatch(name, args, context, stream)
                stream.tool_result(name, output_summary=json.dumps(result, ensure_ascii=False)[:160], status="success")
                s.attributes["output_brief"] = str(result)[:200]
                return result
            except Exception as exc:
                stream.tool_result(name, output_summary=str(exc)[:160], status="error")
                s.status = "error"
                s.error_message = str(exc)[:200]
                return {"error": str(exc)[:300]}

    async def _dispatch(
        self,
        name: str,
        args: dict[str, Any],
        context: UnifiedContext,
        stream: StreamBus,
    ) -> Any:
        if name.startswith("route_to_"):
            cap_name = name.removeprefix("route_to_")
            return await self._route_to_capability(cap_name, args, context, stream)
        if name == "query_mastery":
            limit = int(args.get("limit", 5))
            snap = await MasteryStore().get_mastery(context.session_id)
            kcs = snap.get("kcs", [])
            return {
                "summary": snap.get("summary"),
                "weak_top": [
                    {"label": k["label"], "mastery": k["mastery"]}
                    for k in kcs[:limit]
                ],
            }
        if name == "query_due_cards":
            limit = int(args.get("limit", 10))
            due = await ReviewStore().query_due(context.session_id, limit=limit)
            return {
                "due_count": len(due),
                "preview": [
                    {"front": c.get("front", "")[:80], "state": c.get("state")}
                    for c in due[:5]
                ],
            }
        if name == "query_knowledge_graph":
            kg_data = await KnowledgeGraph().get(context.session_id)
            return {
                "node_count": len(kg_data.get("nodes", [])),
                "edge_count": len(kg_data.get("edges", [])),
                "nodes_preview": [
                    {"id": n["id"], "label": n["label"]}
                    for n in kg_data.get("nodes", [])[:8]
                ],
            }
        return {"error": f"unknown tool {name}"}

    async def _route_to_capability(
        self,
        cap_name: str,
        args: dict[str, Any],
        context: UnifiedContext,
        stream: StreamBus,
    ) -> dict[str, Any]:
        """把控制权交给另一个 capability 跑完整流水线，再把摘要回填给 agentic loop。"""
        # 延迟导入避免循环依赖
        from runtime.registry import get_capability_registry

        cap = get_capability_registry().get(cap_name)
        if cap is None:
            return {"error": f"capability {cap_name} not found"}

        # 用一个内嵌 stream 跑子 capability，不污染主流（除非是 resource_gen，
        # 它的资源副作用本来就要持久化，所以让事件直接进主流）
        sub_context = UnifiedContext(
            session_id=context.session_id,
            user_message=str(args.get("user_intent", context.user_message)),
            active_capability=cap_name,
            conversation_history=context.conversation_history,
            memory_context=context.memory_context,
            knowledge_context=context.knowledge_context,
            learner_profile=context.learner_profile,
            learning_goal=context.learning_goal,
        )

        # 直接复用主 stream（子能力的进度也对学生可见，更透明）
        try:
            await cap.run(sub_context, stream)
            return {"status": "ok", "capability": cap_name, "note": "已为学生完成该能力的完整流程"}
        except Exception as exc:
            return {"status": "error", "capability": cap_name, "error": str(exc)[:300]}

    async def _stream_final(self, llm: Any, messages: list, stream: StreamBus) -> None:
        try:
            async for chunk in llm.astream(messages):
                text = self._chunk_text(chunk.content)
                if text:
                    stream.content(text, source="AgenticChat")
        except Exception as exc:
            stream.error(f"AgenticChat 输出失败: {exc}")

    # ---- ReAct fallback ----

    _REACT_PROMPT = """你是 ZhiPath 智能路由导师。如果需要调用工具，回复严格 JSON：
{"tool": "工具名", "args": {...}}
否则正常用中文回答学生。

可用工具：
- route_to_goal / route_to_learning / route_to_resource_gen / route_to_auto_tutor / route_to_debate (args: {"user_intent": "..."} )
- query_mastery (args: {"limit": int})
- query_due_cards (args: {"limit": int})
- query_knowledge_graph (args: {})

学生问题：
"""

    async def _react_fallback(
        self,
        llm: Any,
        context: UnifiedContext,
        stream: StreamBus,
    ) -> None:
        prompt = self._REACT_PROMPT + context.user_message
        messages = [
            SystemMessage(content=self._REACT_PROMPT),
            HumanMessage(content=context.user_message),
        ]
        try:
            first = await llm.ainvoke(messages)
            text = first.content if hasattr(first, "content") else str(first)
        except Exception as exc:
            stream.error(f"ReAct fallback 失败: {exc}")
            return

        match = re.search(r"\{[\s\S]*?\"tool\"[\s\S]*?\}", text)
        if not match:
            stream.content(text, source="AgenticChat-ReAct")
            return

        try:
            call = json.loads(match.group(0))
        except json.JSONDecodeError:
            stream.content(text, source="AgenticChat-ReAct")
            return

        result = await self._dispatch(
            call.get("tool", ""),
            call.get("args", {}),
            context,
            stream,
        )
        messages.append(AIMessage(content=text))
        messages.append(HumanMessage(content=f"工具结果：{json.dumps(result, ensure_ascii=False)[:1000]}\n请基于此用中文回答学生。"))
        await self._stream_final(llm, messages, stream)
