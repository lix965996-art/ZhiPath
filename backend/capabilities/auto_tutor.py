"""Auto-Tutor 自动学习闭环（必做项 1+2+3 + 加分项 4+5 一站式打通）。

把"目标诊断 → 资源生成 → 试卷生成 → 模拟测验自评 → 反馈与画像更新 → 学习路径重规划"
作为单一能力一次性跑完，对应赛题要求的"个性化学习路径规划"与"学习效果评估"加分项。

每一步通过 StreamBus 的 LOOP_STEP 事件向前端推送进度，前端可在"学习闭环可视化"中
按阶段高亮当前节点。任何单步失败都会优雅降级、继续推进，绝不卡死整个闭环。
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
from modules.learning_path.agents.path_scheduler import schedule_learning_path_with_llm
from modules.resource_gen.agents.code_lab_generator import generate_code_lab_with_llm
from modules.resource_gen.agents.flashcard_generator import generate_flashcards_with_llm
from modules.resource_gen.agents.mindmap_generator import generate_mindmap_with_llm
from modules.resource_gen.agents.quiz_generator import generate_quiz_with_llm
from modules.skill_gap.agents.learning_goal_refiner import refine_learning_goal_with_llm
from modules.skill_gap.agents.skill_gap_identifier import identify_skill_gap_with_llm
from modules.skill_gap.agents.skill_requirement_mapper import map_goal_to_skills_with_llm
from services.exam.store import ExamStore
from services.profile import LearningProfileService
from services.quiz.quiz_store import QuizStore
from services.resource_package.store import ResourcePackageStore

logger = logging.getLogger(__name__)


SYSTEM_PROMPT = """你是 ZhiPath 的自动闭环导师（Auto-Tutor）。
你刚刚串联了"目标诊断 → 资源生成 → 试卷与测验 → 模拟自评 → 画像更新 → 路径重规划"五个智能体阶段。

请基于已注入的各阶段结构化结果，组织一份**学习闭环报告**，必须包含：

## 闭环阶段回顾
按阶段简述每个智能体的产出（目标精炼、技能差距、生成资源条目、试卷题数、自评准确率、薄弱点等）。

## 当前学习诊断
基于自评准确率和错题模式，回答：学生掌握得怎么样，哪里要补。

## 下一步学习计划
结合 PathScheduler 的输出和薄弱点，给出 3-5 个具体下一步动作（小任务）。

## 闭环再次触发建议
明确告诉学生：完成上述任务后说一句什么话，可以让我再跑一遍闭环。

要求：使用中文 Markdown；不要重复输出原始 JSON；语气是教练，不要客套。
"""


LOOP_STEPS = [
    ("diagnose", "目标诊断 (GoalPlanner+SkillMapper+GapAnalyzer)"),
    ("generate", "资源生成 (Quiz+Flashcard+MindMap+CodeLab)"),
    ("exam", "试卷封装 (ExamStore)"),
    ("self_assess", "模拟自评 (LLM 评分)"),
    ("update_profile", "画像更新 (LearnerProfileService)"),
    ("reschedule", "路径重规划 (PathScheduler)"),
    ("report", "闭环报告"),
]


class AutoTutorCapability(PromptedLLMCapability):
    """五阶段自动学习闭环：用一条 user 消息触发整套多智能体协作流程。"""

    manifest = CapabilityManifest(
        name="auto_tutor",
        description="一键启动自动学习闭环：诊断→生成→测验→评估→重规划。",
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
            "SelfAssessLLM",
            "LearnerProfileService",
            "PathScheduler",
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

            # Step 3: 试卷封装
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

            # Step 4: 模拟自评（用一段 LLM 评估闭环本身效果）
            self._step(stream, "self_assess", "running")
            self._emit_agent_message(stream, "ExamStore", "SelfAssessLLM", loop_state["exam"], label="待评估试卷")
            assessment = await self._self_assess(llm, quiz, profile, effective_goal)
            loop_state["assessment"] = assessment
            self._step(stream, "self_assess", "done", metadata=assessment)

            # Step 5: 画像 +薄弱点回写
            self._step(stream, "update_profile", "running")
            profile_service = LearningProfileService()
            wrong_topics = assessment.get("wrong_topics", [])
            accuracy = assessment.get("estimated_accuracy", 0.6)
            updated_profile = await profile_service.update_weak_points_from_quiz(
                session_id=context.session_id,
                wrong_topics=wrong_topics,
                accuracy=accuracy,
            )
            stream.profile_update(
                "weak_points",
                ", ".join(wrong_topics) if wrong_topics else "暂无薄弱点",
                evidence=f"Auto-Tutor 闭环：自评准确率 {accuracy:.0%}",
            )
            self._emit_agent_message(stream, "SelfAssessLLM", "LearnerProfileService", {
                "wrong_topics": wrong_topics,
                "accuracy": accuracy,
            }, label="薄弱点回写")
            loop_state["profile_after"] = {
                "weak_points": updated_profile.get("weak_points", []),
                "quiz_accuracy": updated_profile.get("quiz_accuracy"),
            }
            self._step(stream, "update_profile", "done", metadata=loop_state["profile_after"])

            # Step 6: 路径重规划
            self._step(stream, "reschedule", "running")
            self._emit_agent_message(
                stream,
                "LearnerProfileService",
                "PathScheduler",
                updated_profile,
                label="新画像驱动重规划",
            )
            path = await self._invoke_agent(
                "PathScheduler",
                lambda **kw: schedule_learning_path_with_llm(llm, **kw),
                stream,
                learner_profile=updated_profile,
                session_count=5,
            )
            loop_state["path"] = path
            self._step(stream, "reschedule", "done")

            # 资源包：把闭环成果落盘
            await ResourcePackageStore().create_from_generation(
                session_id=context.session_id,
                source_prompt=context.user_message,
                learner_profile=updated_profile,
                knowledge_context=context.knowledge_context or "",
                quiz=quiz,
                flashcards=flashcards,
                mindmap=mindmap,
                exam=exam,
                code_lab=code_lab,
            )

            self._step(stream, "report", "running")

        await self._run_llm_with_agent_context(context, stream, {
            "目标诊断": loop_state.get("diagnose"),
            "资源汇总": loop_state.get("resources"),
            "试卷": loop_state.get("exam"),
            "自评结果": loop_state.get("assessment"),
            "薄弱点回写后画像": loop_state.get("profile_after"),
            "重规划路径": loop_state.get("path"),
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

    async def _self_assess(
        self,
        llm: Any,
        quiz: dict[str, Any] | None,
        profile: dict[str, Any],
        learning_goal: str,
    ) -> dict[str, Any]:
        """让 LLM 扮演"模拟做题的学生"，给出预估准确率和易错知识点。"""
        if not quiz:
            return {"estimated_accuracy": 0.0, "wrong_topics": [], "summary": "无题目可评估"}
        try:
            from langchain_core.messages import HumanMessage, SystemMessage
            prompt_sys = (
                "你是 ZhiPath 的学习效果评估代理。"
                "现在请基于一组刚生成的题目、当前画像和学习目标，预估一个该学生（按画像）的答题准确率，"
                "并列出最可能出错的知识点（最多 5 个）。"
                "只输出严格 JSON：{\"estimated_accuracy\": float, \"wrong_topics\": [str], "
                "\"summary\": str}，accuracy 在 0 到 1 之间。"
            )
            user = (
                f"学习目标：{learning_goal}\n\n"
                f"学习者画像：{json.dumps(profile, ensure_ascii=False)[:1200]}\n\n"
                f"题目：{json.dumps(quiz, ensure_ascii=False)[:1500]}"
            )
            result = await asyncio.to_thread(
                lambda: llm.invoke([SystemMessage(content=prompt_sys), HumanMessage(content=user)]),
            )
            from utils.llm_output import convert_json_output
            data = convert_json_output(result.content if hasattr(result, "content") else str(result))
            if not isinstance(data, dict):
                return {"estimated_accuracy": 0.6, "wrong_topics": [], "summary": ""}
            data["estimated_accuracy"] = float(data.get("estimated_accuracy", 0.6))
            data["wrong_topics"] = [str(t) for t in data.get("wrong_topics", []) if t][:5]
            return data
        except Exception as exc:  # pragma: no cover
            logger.warning("Auto-Tutor self-assess failed: %s", exc)
            return {"estimated_accuracy": 0.6, "wrong_topics": [], "summary": "自评失败，使用默认估计"}


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
