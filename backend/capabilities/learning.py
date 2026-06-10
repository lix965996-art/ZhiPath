from __future__ import annotations

from typing import Any

from base.llm_factory import LLMFactory
from capabilities.base import CapabilityManifest
from capabilities.llm_capability import PromptedLLMCapability
from core.context import UnifiedContext
from core.stream_bus import StreamBus
from modules.learner_profile.agents.adaptive_profiler import (
    initialize_learner_profile_with_llm,
    update_learner_profile_with_llm,
)
from modules.learning_path.agents.path_scheduler import schedule_learning_path_with_llm
from services.path_revision_store import PathRevisionStore


SYSTEM_PROMPT = """你是 ZhiPath 的学习路径规划模块，负责根据学习画像生成个性化学习安排。

你要像工程项目排期一样规划学习，而不是给泛泛建议。请按以下结构输出：

## 1. 学习者画像快照
归纳当前水平、目标、薄弱点、偏好、时间约束。如果缺失，用”默认假设”说明。

## 2. 路径设计原则
说明为什么这样安排：先补什么、后做什么、哪些内容暂时不做。

## 3. 分阶段学习路径
按阶段或周输出，每个阶段包含：
- 阶段目标
- 输入材料
- 学习任务
- 练习任务
- 产出物
- 验收标准

## 4. 反馈闭环
说明系统如何根据答题结果或错因调整下一阶段路径。

## 5. 风险控制
列出可能失败的点，例如数学基础薄弱、时间不足、只看不练，并给出应对策略。

要求：
- 使用中文。
- 尽量给表格或清单。
- 每一项都要可执行、可验收。
"""


class LearningCapability(PromptedLLMCapability):
    manifest = CapabilityManifest(
        name="learning",
        description="个性化学习路径规划、练习节奏与反馈策略。",
        stages=["learning_plan"],
        tools_used=["ProfileBuilder", "PathScheduler", "FeedbackPlanner"],
    )
    system_prompt = SYSTEM_PROMPT
    stage_name = "learning_plan"
    route_task = "reasoning"

    async def run(self, context: UnifiedContext, stream: StreamBus) -> None:
        llm = self._resolve_llm(stream)
        agent_results: dict[str, Any] = {}

        async with stream.stage("learning_analysis"):
            # Step 1: ProfileBuilder — 构建/更新学习者画像
            profile = context.learner_profile or {}
            has_existing = bool(profile.get("cognitive_status"))

            if has_existing:
                prof_result = await self._invoke_agent(
                    "ProfileBuilder",
                    lambda **kw: update_learner_profile_with_llm(llm, **kw),
                    stream,
                    learner_profile=profile,
                    learner_interactions=context.conversation_history[-5:],
                    learner_information=context.user_message,
                )
            else:
                prof_result = await self._invoke_agent(
                    "ProfileBuilder",
                    lambda **kw: initialize_learner_profile_with_llm(llm, **kw),
                    stream,
                    learning_goal=context.learning_goal or context.user_message,
                    learner_information=context.user_message,
                    skill_gaps=[],
            )
            if prof_result:
                agent_results["学习者画像"] = prof_result

            # Step 2: PathScheduler — 生成学习路径
            # exam_context (408 考研场景) 必须透传, adaptive_profiler 翻译后会丢字段
            effective_profile: dict[str, Any] = dict(prof_result or profile)
            exam_ctx = (profile or {}).get("exam_context") if isinstance(profile, dict) else None
            if exam_ctx:
                effective_profile["exam_context"] = exam_ctx
            path_result = await self._invoke_agent(
                "PathScheduler",
                lambda **kw: schedule_learning_path_with_llm(llm, **kw),
                stream,
                learner_profile=effective_profile,
            )
            if path_result:
                agent_results["学习路径规划"] = path_result

                # 真记录: 写一条 PathRevision (每次 PathScheduler 跑完都视为一次重规划)
                try:
                    revision_store = PathRevisionStore()
                    new_sessions = path_result.get("learning_path", []) if isinstance(path_result, dict) else []
                    # 推断 trigger
                    has_quiz_signal = isinstance(profile, dict) and (
                        isinstance(profile.get("quiz_accuracy"), (int, float))
                    )
                    has_new_evidence = isinstance(profile, dict) and bool(profile.get("evidence_log"))
                    if has_quiz_signal:
                        trigger = "quiz_feedback"
                        reason = (
                            f"最近测验正确率 {round((profile or {}).get('quiz_accuracy', 0) * 100)}%, "
                            "重新评估剩余阶段"
                        )
                    elif has_new_evidence:
                        trigger = "profile_update"
                        evidence_log = (profile or {}).get("evidence_log") or []
                        reason = f"画像新增 {len(evidence_log)} 条证据, 重新匹配阶段"
                    else:
                        trigger = "explicit_request"
                        reason = "学生主动请求重新规划路径"

                    new_summary = " → ".join(
                        str(s.get("title", "?"))[:18] for s in new_sessions[:6]
                    ) or "无新阶段"
                    await revision_store.append(
                        session_id=context.session_id,
                        trigger=trigger,
                        reason=reason,
                        previous_summary="",  # 老路径不存在 (第一次跑) 或调用方不传, 留空
                        new_summary=new_summary,
                        previous_stage_count=0,
                        new_stage_count=len(new_sessions),
                        metadata={
                            "weak_points": (profile or {}).get("weak_points", [])[:5],
                            "quiz_accuracy": (profile or {}).get("quiz_accuracy"),
                        },
                    )
                except Exception as exc:  # pragma: no cover - 记录失败不阻塞
                    stream.thinking(f"PathRevision 记录失败 (已忽略): {exc}")

        await self._run_llm_with_agent_context(context, stream, agent_results)
