"""Auto-Tutor 自动学习管线（目标诊断 → 资源生成 → 试卷封装 → 学习建议报告）。

把"目标诊断 → 资源生成 → 试卷生成"作为单一能力一次性跑完，
最后由 LLM 基于真实产出撰写个性化学习建议报告。

每一步通过 StreamBus 的 LOOP_STEP 事件向前端推送进度。
任何单步失败都会优雅降级、继续推进，绝不卡死整个管线。
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from base.llm_factory import LLMFactory
from capabilities.base import CapabilityManifest
from capabilities.llm_capability import PromptedLLMCapability
from core.context import UnifiedContext
from core.stream_bus import StreamBus
from modules.resource_gen.agents.code_lab_generator import generate_code_lab_with_llm
from modules.resource_gen.agents.flashcard_generator import generate_flashcards_with_llm
from modules.resource_gen.agents.mindmap_generator import generate_mindmap_with_llm
from modules.resource_gen.agents.quiz_generator import generate_quiz_with_llm
from modules.skill_gap.agents.learning_goal_refiner import refine_learning_goal_with_llm
from modules.skill_gap.agents.skill_gap_identifier import identify_skill_gap_with_llm
from modules.skill_gap.agents.skill_requirement_mapper import map_goal_to_skills_with_llm
from services.exam.store import ExamStore
from services.quiz.quiz_store import QuizStore
from services.resource_package.store import ResourcePackageStore

logger = logging.getLogger(__name__)


SYSTEM_PROMPT = """你是 ZhiPath 的后台学习编排模块。
你刚刚串联了"目标诊断 → 资源生成 → 试卷封装"三个智能体阶段。

请基于已注入的各阶段结构化结果，组织一份**学习建议报告**，必须包含：

## 1. 目标与差距分析
基于目标诊断阶段的结果，说明学生的学习目标、所需技能和当前差距。

## 2. 资源概览
列出本次生成的资源：题目数量、闪卡数量、知识节点数、代码片段数。
如果生成了试卷，说明题量和满分。

## 3. 学习建议
基于诊断出的技能差距和生成的资源，给出 3-5 个具体可执行的学习建议。

## 4. 下一步
告诉学生如何利用这些资源进行学习，以及完成后可以做什么。

要求：使用中文 Markdown；不要重复输出原始 JSON；语气是教练，不要客套。
不要在报告中出现 Auto-Tutor 这个名称；这只是内部能力名。
"""


LOOP_STEPS = [
    ("diagnose", "目标诊断 (GoalPlanner+SkillMapper+GapAnalyzer)"),
    ("generate", "资源生成 (Quiz+Flashcard+MindMap+CodeLab)"),
    ("exam", "试卷封装 (ExamStore)"),
    ("report", "学习建议报告"),
]


class AutoTutorCapability(PromptedLLMCapability):
    """三阶段自动学习管线：用一条 user 消息触发整套多智能体协作流程。"""

    manifest = CapabilityManifest(
        name="auto_tutor",
        description="一键启动自动学习管线：诊断→生成→试卷→学习建议。",
        stages=["auto_tutor_loop"],
        tools_used=[
            "GoalPlanner",
            "SkillMapper",
            "GapAnalyzer",
            "QuizGenerator",
            "FlashcardGenerator",
            "MindMapGenerator",
            "CodeLabGenerator",
            "ExamStore",
        ],
    )
    system_prompt = SYSTEM_PROMPT
    stage_name = "auto_tutor_loop"
    route_task = "reasoning"

    async def run(self, context: UnifiedContext, stream: StreamBus) -> None:
        llm = self._resolve_llm(stream)
        loop_state: dict[str, Any] = {}
        profile = dict(context.learner_profile or {})
        learning_doc = self._build_learning_doc(context)

        async with stream.stage("auto_tutor_loop"):
            # Step 1: 目标诊断（3 个子 agent 串联）
            self._step(stream, "diagnose", "running")
            refined = await self._invoke_agent(
                "GoalPlanner",
                lambda **kw: refine_learning_goal_with_llm(llm, **kw),
                stream,
                learning_goal=context.learning_goal or context.user_message,
                learner_information=json.dumps(profile, ensure_ascii=False),
            )
            effective_goal = (
                (refined or {}).get("refined_goal")
                or context.learning_goal
                or context.user_message
            )
            self._emit_agent_message(stream, "GoalPlanner", "SkillMapper", refined, label="精炼目标")
            skills = await self._invoke_agent(
                "SkillMapper",
                lambda **kw: map_goal_to_skills_with_llm(llm, **kw),
                stream,
                learning_goal=effective_goal,
            )
            self._emit_agent_message(stream, "SkillMapper", "GapAnalyzer", skills, label="技能需求")
            gaps = await self._invoke_agent(
                "GapAnalyzer",
                lambda **kw: identify_skill_gap_with_llm(llm, **kw)[0],
                stream,
                learning_goal=effective_goal,
                learner_information=json.dumps(profile, ensure_ascii=False),
                skill_requirements=skills,
            )
            loop_state["diagnose"] = {"refined": refined, "skills": skills, "gaps": gaps}
            self._step(stream, "diagnose", "done")

            # Step 2: 并行资源生成
            self._step(stream, "generate", "running")
            self._emit_agent_message(stream, "Orchestrator", "QuizGenerator", {"goal": effective_goal}, label="出题需求")
            self._emit_agent_message(stream, "Orchestrator", "FlashcardGenerator", {"goal": effective_goal}, label="闪卡需求")
            self._emit_agent_message(stream, "Orchestrator", "MindMapGenerator", {"goal": effective_goal}, label="导图需求")
            self._emit_agent_message(stream, "Orchestrator", "CodeLabGenerator", {"goal": effective_goal}, label="代码实操需求")
            quiz_task = self._invoke_agent(
                "QuizGenerator",
                lambda **kw: generate_quiz_with_llm(llm, **kw),
                stream,
                learner_profile=profile,
                learning_document=learning_doc,
                single_choice_count=3,
                multiple_choice_count=1,
                true_false_count=1,
                short_answer_count=1,
            )
            flashcard_task = self._invoke_agent(
                "FlashcardGenerator",
                lambda **kw: generate_flashcards_with_llm(llm, **kw),
                stream,
                learning_document=learning_doc,
            )
            mindmap_task = self._invoke_agent(
                "MindMapGenerator",
                lambda **kw: generate_mindmap_with_llm(llm, **kw),
                stream,
                learning_document=learning_doc,
            )
            code_lab_task = self._invoke_agent(
                "CodeLabGenerator",
                lambda **kw: generate_code_lab_with_llm(llm, **kw),
                stream,
                learner_profile=profile,
                learning_document=learning_doc,
                user_request=context.user_message,
            )
            quiz, flashcards, mindmap, code_lab = await asyncio.gather(
                quiz_task, flashcard_task, mindmap_task, code_lab_task,
            )
            loop_state["resources"] = {
                "quiz_questions": _quiz_total(quiz),
                "flashcards": len((flashcards or {}).get("cards", [])),
                "mindmap_nodes": len((mindmap or {}).get("nodes", [])),
                "code_snippets": len((code_lab or {}).get("snippets", [])),
            }
            self._step(stream, "generate", "done", metadata=loop_state["resources"])

            # Step 3: 试卷封装 + 资源包落盘
            self._step(stream, "exam", "running")
            exam = None
            if quiz:
                await QuizStore().save_quiz(context.session_id, quiz)
                exam = await ExamStore().create_from_quiz(
                    session_id=context.session_id,
                    quiz_data=quiz,
                    learner_profile=profile,
                    source_prompt=context.user_message,
                )
            loop_state["exam"] = {
                "question_count": (exam or {}).get("questions") and len(exam["questions"]) or 0,
                "title": (exam or {}).get("title"),
            }
            self._step(stream, "exam", "done", metadata=loop_state["exam"])

            # 资源包落盘
            await ResourcePackageStore().create_from_generation(
                session_id=context.session_id,
                source_prompt=context.user_message,
                learner_profile=profile,
                knowledge_context=context.knowledge_context or "",
                quiz=quiz,
                flashcards=flashcards,
                mindmap=mindmap,
                exam=exam,
                code_lab=code_lab,
            )

            self._step(stream, "report", "running")

        # Step 4: 基于真实产出撰写学习建议报告
        await self._run_llm_with_agent_context(context, stream, {
            "目标诊断": loop_state.get("diagnose"),
            "资源汇总": loop_state.get("resources"),
            "试卷": loop_state.get("exam"),
        })

        self._step(stream, "report", "done")

    @staticmethod
    def _step(stream: StreamBus, step: str, status: str, metadata: dict | None = None) -> None:
        stream.loop_step(step, status=status, **(metadata or {}))

    @staticmethod
    def _build_learning_doc(context: UnifiedContext) -> str:
        kc = context.knowledge_context or ""
        if kc.strip():
            return (
                f"【本轮学习目标】{context.user_message}\n\n"
                f"【知识库参考】\n{kc}"
            )
        return context.user_message


def _quiz_total(quiz: dict[str, Any] | None) -> int:
    if not quiz:
        return 0
    total = 0
    for key in (
        "single_choice_questions",
        "multiple_choice_questions",
        "true_false_questions",
        "short_answer_questions",
    ):
        total += len(quiz.get(key, []) or [])
    return total
