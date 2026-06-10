from __future__ import annotations

import json
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))


def _db_available() -> bool:
    try:
        import asyncpg
        return True
    except ImportError:
        return False


pytestmark_db = pytest.mark.skipif(not _db_available(), reason="asyncpg not installed")


class TestSessionStore:
    """Test SessionStore CRUD operations."""

    @pytestmark_db
    def test_create_session_returns_dict(self):
        from services.session.store import SessionStore
        store = SessionStore()
        assert hasattr(store, "create_session")
        assert hasattr(store, "get_session")
        assert hasattr(store, "list_sessions")
        assert hasattr(store, "add_message")
        assert hasattr(store, "delete_session")


class TestMemoryService:
    """Test MemoryService interface."""

    @pytestmark_db
    def test_interface_methods_exist(self):
        from services.memory.service import MemoryService
        svc = MemoryService()
        assert hasattr(svc, "read_summary")
        assert hasattr(svc, "read_profile")
        assert hasattr(svc, "build_memory_context")
        assert hasattr(svc, "write_summary")
        assert hasattr(svc, "write_profile")


class TestLearningProfileService:
    """Test deterministic extraction methods."""

    def test_extract_topics(self):
        from services.profile.service import LearningProfileService
        topics = LearningProfileService._extract_topics("我想学习机器学习和深度学习")
        assert "机器学习" in topics
        assert "深度学习" in topics

    def test_extract_goal(self):
        from services.profile.service import LearningProfileService
        goal = LearningProfileService._extract_goal("我想学会Python编程")
        assert "想" in goal
        assert "Python" in goal

    def test_infer_level_beginner(self):
        from services.profile.service import LearningProfileService
        level = LearningProfileService._infer_level("我是零基础的新手")
        assert level == "初学者"

    def test_infer_level_advanced(self):
        from services.profile.service import LearningProfileService
        level = LearningProfileService._infer_level("我想进阶深入学习")
        assert level == "进阶学习者"

    def test_extract_weak_points(self):
        from services.profile.service import LearningProfileService
        weak = LearningProfileService._extract_weak_points("我分不清监督学习和无监督学习")
        assert len(weak) > 0

    def test_extract_constraints(self):
        from services.profile.service import LearningProfileService
        constraints = LearningProfileService._extract_constraints("我有3天时间准备考试")
        assert any("3天" in c for c in constraints)
        assert "考试导向" in constraints

    def test_infer_intents(self):
        from services.profile.service import LearningProfileService
        intents = LearningProfileService._infer_intents("帮我做个目标规划", "goal")
        assert "目标诊断" in intents


class TestStreamBus:
    """Test StreamBus event emission."""

    def test_content_emits_content_event(self):
        from core.stream_bus import StreamBus
        from core.events import EventType
        bus = StreamBus()
        bus.content("hello", source="test")
        assert len(bus._history) == 1
        assert bus._history[0].type == EventType.CONTENT
        assert bus._history[0].content == "hello"

    def test_thinking_emits_thinking_event(self):
        from core.stream_bus import StreamBus
        from core.events import EventType
        bus = StreamBus()
        bus.thinking("processing...")
        assert bus._history[0].type == EventType.THINKING

    def test_result_emits_result_event(self):
        from core.stream_bus import StreamBus
        from core.events import EventType
        bus = StreamBus()
        bus.result('{"key": "value"}', source="test")
        assert bus._history[0].type == EventType.RESULT
        assert bus._history[0].content == '{"key": "value"}'

    def test_done_emits_done_event(self):
        from core.stream_bus import StreamBus
        from core.events import EventType
        bus = StreamBus()
        bus.done()
        assert bus._history[0].type == EventType.DONE

    def test_stage_emits_start_and_end(self):
        import asyncio
        from core.stream_bus import StreamBus
        from core.events import EventType
        bus = StreamBus()

        async def run_stage():
            async with bus.stage("test"):
                bus.content("inside stage")

        asyncio.run(run_stage())
        types = [e.type for e in bus._history]
        assert EventType.STAGE_START in types
        assert EventType.STAGE_END in types
        assert types.index(EventType.STAGE_START) < types.index(EventType.CONTENT)
        assert types.index(EventType.CONTENT) < types.index(EventType.STAGE_END)


class TestRAGPipeline:
    """Test retrieval behavior and vector fallback contract."""

    @pytest.mark.asyncio
    async def test_lexical_search_returns_seed_document(self):
        from services.rag.pipeline import RAGPipeline

        rag = RAGPipeline()
        results = rag._search_lexical("监督学习和无监督学习有什么区别", k=3)

        assert results
        assert any("监督学习" in item.title for item in results)
        assert all(item.retrieval_mode == "lexical" for item in results)

    @pytest.mark.asyncio
    async def test_search_falls_back_when_vector_unavailable(self):
        from services.rag.pipeline import RAGPipeline

        rag = RAGPipeline()
        with patch.object(rag, "_search_vector", AsyncMock(return_value=[])):
            results = await rag.search("动态规划状态转移", k=2)

        assert results
        assert results[0].retrieval_mode == "lexical"

    @pytest.mark.asyncio
    async def test_search_prefers_vector_results(self):
        from services.rag.pipeline import KnowledgeChunk, RAGPipeline

        rag = RAGPipeline()
        vector_result = KnowledgeChunk(
            document_id="doc_1",
            title="向量结果",
            content="semantic retrieval",
            tags=["test"],
            score=0.93,
            retrieval_mode="pgvector",
        )

        with patch.object(rag, "_search_vector", AsyncMock(return_value=[vector_result])):
            results = await rag.search("任意问题", k=1)

        assert results == [vector_result]
        assert results[0].retrieval_mode == "pgvector"


class TestQuizFeedbackService:
    """Test adaptive remediation output from quiz feedback."""

    def test_remediation_plan_high_priority_for_low_accuracy(self):
        from services.quiz.feedback_service import QuizFeedbackService

        wrong_questions = [
            {"_type": "single_choice", "question": "循环变量如何更新？"},
            {"_type": "true_false", "question": "while 循环一定会终止。"},
            {"_type": "short_answer", "question": "解释 break 和 continue 的区别。"},
        ]
        plan = QuizFeedbackService._build_remediation_plan(
            accuracy=0.3,
            wrong_topics=["循环变量如何更新？", "while 循环一定会终止。"],
            wrong_questions=wrong_questions,
        )

        assert plan["priority"] == "high"
        assert plan["mastery_level"] == "需要补救"
        assert plan["target_topics"]
        assert len(plan["resource_actions"]) >= 3
        assert any("补救" in task or "微讲义" in task for task in plan["next_tasks"])

    def test_remediation_plan_infers_error_patterns(self):
        from services.quiz.feedback_service import QuizFeedbackService

        patterns = QuizFeedbackService._infer_error_patterns([
            {"_type": "single_choice"},
            {"_type": "short_answer"},
        ])

        assert "概念辨析或选项干扰识别不足" in patterns
        assert "表达组织或步骤化说明不足" in patterns


class TestCapabilityManifests:
    """Test that capabilities have correct manifests."""

    def test_goal_capability_manifest(self):
        from capabilities.goal import GoalCapability
        cap = GoalCapability()
        assert cap.name == "goal"
        assert "goal_diagnosis" in cap.manifest.stages

    def test_resource_gen_manifest(self):
        from capabilities.resource_gen import ResourceGenerationCapability
        cap = ResourceGenerationCapability()
        assert cap.name == "resource_gen"
        assert "resource_generation" in cap.manifest.stages

    def test_learning_manifest(self):
        from capabilities.learning import LearningCapability
        cap = LearningCapability()
        assert cap.name == "learning"
        assert "learning_plan" in cap.manifest.stages

    def test_chat_manifest(self):
        from capabilities.chat import ChatCapability
        cap = ChatCapability()
        assert cap.name == "chat"


class TestResourceTypeDetection:
    """Test resource type keyword detection."""

    def test_capability_has_tools_used(self):
        from capabilities.resource_gen import ResourceGenerationCapability
        cap = ResourceGenerationCapability()
        assert "QuizGenerator" in cap.manifest.tools_used

    def test_capability_stage_name(self):
        from capabilities.resource_gen import ResourceGenerationCapability
        cap = ResourceGenerationCapability()
        assert cap.stage_name == "resource_generation"


class TestModuleSchemas:
    """Test that Pydantic schemas validate correctly."""

    def test_skill_requirements_validation(self):
        from modules.skill_gap.schemas import SkillRequirement, SkillRequirements
        reqs = SkillRequirements(skill_requirements=[
            SkillRequirement(name="Python", required_level="beginner"),
            SkillRequirement(name="线性代数", required_level="intermediate"),
        ])
        assert len(reqs.skill_requirements) == 2

    def test_quiz_schema(self):
        from modules.resource_gen.schemas import Quiz, SingleChoiceQuestion
        quiz = Quiz(single_choice_questions=[
            SingleChoiceQuestion(
                question="1+1=?",
                options=["1", "2", "3"],
                correct_option=1,
            )
        ])
        assert len(quiz.single_choice_questions) == 1

    def test_learning_path_schema(self):
        from modules.learning_path.schemas import LearningPath, SessionItem, DesiredOutcome
        path = LearningPath(learning_path=[
            SessionItem(
                id="Session 1",
                title="基础入门",
                abstract="学习基本概念",
                if_learned=False,
                associated_skills=["Python"],
                desired_outcome_when_completed=[
                    DesiredOutcome(name="Python", level="beginner")
                ],
            )
        ])
        assert len(path.learning_path) == 1
