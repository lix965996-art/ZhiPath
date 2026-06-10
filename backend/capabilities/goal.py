from __future__ import annotations

import json
from typing import Any

from base.llm_factory import LLMFactory
from capabilities.base import CapabilityManifest
from capabilities.llm_capability import PromptedLLMCapability
from core.context import UnifiedContext
from core.stream_bus import StreamBus
from modules.skill_gap.agents.learning_goal_refiner import refine_learning_goal_with_llm
from modules.skill_gap.agents.skill_gap_identifier import identify_skill_gap_with_llm
from modules.skill_gap.agents.skill_requirement_mapper import map_goal_to_skills_with_llm


SYSTEM_PROMPT = """你是 ZhiPath 的目标诊断模块，负责识别学习目标、基础水平和能力差距。

你的回答要体现工程化诊断，而不是机械追问。请按以下结构输出：

## 1. 输入信号归纳
提取学生已经给出的主题、基础、时间、目标场景、约束和评价标准。

## 2. 信息充分性判断
说明哪些信息已经足够，哪些信息仍不确定。不要因为信息不足就停止工作，要先给可用的初版诊断。

## 3. 目标精炼
把模糊目标改写成可执行目标，格式包含：能力对象、完成条件、时间边界、验收标准。

## 4. 技能地图
列出实现目标需要的核心技能，按”先修基础 -> 核心能力 -> 项目能力”分层。

## 5. 差距判断
基于学生画像判断当前差距，说明优先级和原因。

## 6. 下一步动作
给出 2-3 个下一步建议，并说明后续应进入”学习路径规划””资源构建”或”反馈评估”中的哪个环节。

要求：
- 使用中文。
- 需要有判断依据、约束和取舍。
- 如果要追问，最多问 3 个关键问题，并且必须同时给出一个默认假设下的初版方案。
"""


class GoalCapability(PromptedLLMCapability):
    manifest = CapabilityManifest(
        name="goal",
        description="学习目标诊断、技能地图和差距识别。",
        stages=["goal_diagnosis"],
        tools_used=["GoalPlanner", "SkillMapper", "GapAnalyzer"],
    )
    system_prompt = SYSTEM_PROMPT
    stage_name = "goal_diagnosis"
    route_task = "reasoning"

    async def run(self, context: UnifiedContext, stream: StreamBus) -> None:
        llm = self._resolve_llm(stream)
        agent_results: dict[str, Any] = {}

        async with stream.stage("agent_analysis"):
            # Step 1: GoalPlanner — 精炼学习目标
            refined = await self._invoke_agent(
                "GoalPlanner",
                lambda **kw: refine_learning_goal_with_llm(llm, **kw),
                stream,
                learning_goal=context.learning_goal or context.user_message,
                learner_information=json.dumps(context.learner_profile, ensure_ascii=False) if context.learner_profile else "",
            )
            effective_goal = (refined or {}).get("refined_goal", context.learning_goal or context.user_message)
            if refined:
                agent_results["目标精炼结果"] = refined

            # Step 2: SkillMapper — 映射技能需求
            skills = await self._invoke_agent(
                "SkillMapper",
                lambda **kw: map_goal_to_skills_with_llm(llm, **kw),
                stream,
                learning_goal=effective_goal,
            )
            if skills:
                agent_results["技能需求映射"] = skills

            # Step 3: GapAnalyzer — 识别技能差距
            gaps = await self._invoke_agent(
                "GapAnalyzer",
                lambda **kw: identify_skill_gap_with_llm(llm, **kw)[0],
                stream,
                learning_goal=effective_goal,
                learner_information=json.dumps(context.learner_profile, ensure_ascii=False) if context.learner_profile else "",
                skill_requirements=skills,
            )
            if gaps:
                agent_results["技能差距分析"] = gaps

        await self._run_llm_with_agent_context(context, stream, agent_results)
