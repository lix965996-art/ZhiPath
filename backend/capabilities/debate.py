"""Multi-Agent Debate 能力：3 个不同立场/不同模型的 LLM 对同一学习问题辩论。

参考：Du et al. *Improving Factuality and Reasoning in Language Models through Multiagent Debate* (ICML 2024)、
      Liang et al. *Encouraging Divergent Thinking in Large Language Models through Multi-Agent Debate*.

流程：
  Round 1: 正方 (Proposer) 给出观点 → 反方 (Skeptic) 反驳
  Round 2: 正方根据反驳更新观点 → 反方再反驳
  Final  : 裁判 (Judge) 综合双方论据给出最终学习建议

模型路由策略：
- Proposer / Skeptic 走 reasoning route（DeepSeek Pro）
- Judge 走 long_form route（综合写作）

是赛题"多智能体协同"必做项的"加强版"。
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from base.model_router import get_model_router
from capabilities.base import CapabilityManifest
from capabilities.llm_capability import PromptedLLMCapability
from core.context import UnifiedContext
from core.stream_bus import StreamBus

logger = logging.getLogger(__name__)


PROPOSER_SYSTEM = """你是 ZhiPath 多智能体辩论中的【正方】(Proposer)。
对当前学习问题给出**结构化、可执行**的方案。
要求：
1. 给出主张 + 3 个支撑论据，每条论据可被反驳但你认为成立。
2. 给一个"潜在最佳学习路径"（3-5 步）。
3. 输出严格 JSON: {"主张": str, "支撑论据": [str], "推荐路径": [str], "潜在弱点": [str]}
"""

SKEPTIC_SYSTEM = """你是 ZhiPath 多智能体辩论中的【反方】(Skeptic)。
对正方刚给出的方案做**结构化批判**。
要求：
1. 找 2-3 个关键漏洞或风险（具体到知识点 / 学习方法 / 资源约束）。
2. 提出至少 1 个替代方案。
3. 输出严格 JSON: {"漏洞": [str], "风险": [str], "替代方案": str, "可保留之处": str}
"""

JUDGE_SYSTEM = """你是 ZhiPath 多智能体辩论中的【裁判】(Judge)，由学生信任。
基于多轮正反双方的输出，给出**最终学习建议**。
要求：
1. 综合正反双方有效论据，明确哪一方更有道理（不要骑墙）。
2. 给出 1 个可执行的最终学习路径（3-5 步，含验收）。
3. 标注本辩论的不确定性 / 学生需要在哪些点上做选择。
4. 输出 Markdown，包含"## 裁定 / ## 最终路径 / ## 学生决策点"。
"""


class DebateCapability(PromptedLLMCapability):
    manifest = CapabilityManifest(
        name="debate",
        description="多智能体辩论：正方/反方/裁判三角色，对学习问题进行 2 轮辩论后给出结论。",
        stages=["debate"],
        tools_used=["Proposer", "Skeptic", "Judge"],
    )
    system_prompt = JUDGE_SYSTEM
    stage_name = "debate"
    route_task = "reasoning"

    async def run(self, context: UnifiedContext, stream: StreamBus) -> None:
        router = get_model_router()
        llm_proposer, _ = router.for_task("reasoning")
        llm_skeptic, _ = router.for_task("reasoning")
        llm_judge, _ = router.for_task("long_form")

        async with stream.stage("debate"):
            transcript: list[dict[str, Any]] = []

            # Round 1
            self._emit_agent_message(stream, "Orchestrator", "Proposer", {"round": 1}, label="正方发言")
            proposer1 = await self._llm_json(
                llm_proposer,
                PROPOSER_SYSTEM,
                self._build_user(context, transcript),
                stream,
                "Proposer",
            )
            transcript.append({"role": "Proposer", "round": 1, "data": proposer1})
            stream.thinking("正方第 1 轮观点已提出。")

            self._emit_agent_message(stream, "Proposer", "Skeptic", proposer1, label="正方→反方")
            skeptic1 = await self._llm_json(
                llm_skeptic,
                SKEPTIC_SYSTEM,
                self._build_user(context, transcript),
                stream,
                "Skeptic",
            )
            transcript.append({"role": "Skeptic", "round": 1, "data": skeptic1})
            stream.thinking("反方第 1 轮反驳完成。")

            # Round 2
            self._emit_agent_message(stream, "Skeptic", "Proposer", skeptic1, label="反方→正方反驳")
            proposer2 = await self._llm_json(
                llm_proposer,
                PROPOSER_SYSTEM,
                self._build_user(context, transcript),
                stream,
                "Proposer",
            )
            transcript.append({"role": "Proposer", "round": 2, "data": proposer2})

            self._emit_agent_message(stream, "Proposer", "Skeptic", proposer2, label="正方更新观点")
            skeptic2 = await self._llm_json(
                llm_skeptic,
                SKEPTIC_SYSTEM,
                self._build_user(context, transcript),
                stream,
                "Skeptic",
            )
            transcript.append({"role": "Skeptic", "round": 2, "data": skeptic2})

            # Judge：流式输出最终裁定
            self._emit_agent_message(stream, "Skeptic", "Judge", transcript, label="进入终审")

        await self._stream_judge(llm_judge, context, transcript, stream)

    async def _stream_judge(
        self,
        llm: Any,
        context: UnifiedContext,
        transcript: list[dict[str, Any]],
        stream: StreamBus,
    ) -> None:
        from langchain_core.messages import HumanMessage, SystemMessage

        user_block = (
            f"学生问题：{context.user_message}\n\n"
            f"辩论记录：\n{json.dumps(transcript, ensure_ascii=False, indent=2)[:4000]}"
        )
        messages = [
            SystemMessage(content=JUDGE_SYSTEM),
            HumanMessage(content=user_block),
        ]
        async with stream.stage("judge_render"):
            try:
                async for chunk in llm.astream(messages):
                    text = self._chunk_text(chunk.content)
                    if text:
                        stream.content(text, source="Judge")
            except Exception as exc:  # pragma: no cover
                stream.error(f"裁判输出失败: {exc}")

    async def _llm_json(
        self,
        llm: Any,
        system: str,
        user: str,
        stream: StreamBus,
        agent_name: str,
    ) -> dict[str, Any]:
        from langchain_core.messages import HumanMessage, SystemMessage

        from utils.llm_output import convert_json_output

        try:
            stream.tool_call(agent_name, input_summary=user[:120])
            result = await asyncio.to_thread(
                lambda: llm.invoke([SystemMessage(content=system), HumanMessage(content=user)]),
            )
            raw = result.content if hasattr(result, "content") else str(result)
            data = convert_json_output(raw)
            stream.tool_result(agent_name, output_summary=json.dumps(data, ensure_ascii=False)[:160], status="success")
            return data if isinstance(data, dict) else {"raw": raw}
        except Exception as exc:
            stream.tool_result(agent_name, output_summary=str(exc)[:120], status="error")
            return {"error": str(exc)}

    def _build_user(self, context: UnifiedContext, transcript: list[dict[str, Any]]) -> str:
        lines = [f"# 学生学习问题\n{context.user_message}\n"]
        if context.knowledge_context:
            lines.append(f"# 知识库参考\n{context.knowledge_context[:1500]}\n")
        if transcript:
            lines.append("# 辩论历史")
            for t in transcript:
                lines.append(f"## {t['role']} (Round {t['round']})\n{json.dumps(t.get('data', {}), ensure_ascii=False)[:1200]}")
        return "\n".join(lines)
