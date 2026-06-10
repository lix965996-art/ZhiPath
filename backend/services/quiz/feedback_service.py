from __future__ import annotations

import logging
from typing import Any

from services.mastery import DKTService, MasteryStore
from services.profile.service import LearningProfileService
from services.srs import ReviewStore, extract_review_candidates_from_quiz
from services.xapi import get_lrs

logger = logging.getLogger(__name__)

ACCURACY_THRESHOLD = 0.6
WRONG_COUNT_THRESHOLD = 2


class QuizFeedbackService:
    """Evaluate quiz answers, update learner profile, trigger adaptive re-analysis when needed."""

    def __init__(self) -> None:
        self.profile_service = LearningProfileService()
        self.mastery_store = MasteryStore()
        self.review_store = ReviewStore()
        self.dkt_service = DKTService()

    async def evaluate_and_update(
        self,
        session_id: str,
        answers: list[dict[str, Any]],
        quiz_data: dict[str, Any],
    ) -> dict[str, Any]:
        """
        1. Compare answers against quiz correct answers
        2. Compute accuracy
        3. Extract wrong topics
        4. Update profile weak_points
        5. Return evaluation result
        """
        all_questions = self._flatten_questions(quiz_data)
        total = len(all_questions)
        if total == 0:
            return {"total": 0, "correct": 0, "accuracy": 0, "wrong_topics": [], "analysis": "无可评估的题目", "path_updated": False}

        # Build answer map: question_index -> user_answer
        answer_map = {a["question_index"]: a["answer"] for a in answers}

        correct = 0
        wrong_questions: list[dict[str, Any]] = []

        for idx, q in enumerate(all_questions):
            user_answer = answer_map.get(idx)
            is_correct = self._check_answer(q, user_answer)
            if is_correct:
                correct += 1
            else:
                wrong_questions.append(q)

        accuracy = correct / total if total > 0 else 0
        wrong_topics = self._extract_wrong_topics(wrong_questions)
        wrong_indices = [
            idx for idx, q in enumerate(all_questions)
            if not self._check_answer(q, answer_map.get(idx))
        ]

        # Update profile
        if wrong_topics:
            await self.profile_service.update_weak_points_from_quiz(
                session_id=session_id,
                wrong_topics=wrong_topics,
                accuracy=accuracy,
            )

        # BKT 知识追踪：每道题作为一个观测 (label = 题目摘要前 30 字)
        observations = []
        for idx, q in enumerate(all_questions):
            label = q.get("question", "")[:30].strip()
            if label:
                observations.append({
                    "label": label,
                    "correct": self._check_answer(q, answer_map.get(idx)),
                })
        mastery_snapshot = None
        dkt_snapshot = None
        if observations:
            try:
                mastery_snapshot = await self.mastery_store.update_observations(
                    session_id, observations,
                )
            except Exception as exc:  # pragma: no cover - 优雅降级
                logger.warning("BKT update failed: %s", exc)
            # DKT 同步训练（小数据量 ES 优化）
            try:
                dkt_snapshot = await self.dkt_service.fit_and_predict(
                    session_id, observations,
                )
            except Exception as exc:  # pragma: no cover
                logger.warning("DKT fit failed: %s", exc)

        # FSRS：把错题自动入复习队列
        try:
            candidates = extract_review_candidates_from_quiz(
                quiz_data,
                wrong_indices=wrong_indices,
                topic_hint=(wrong_topics[0] if wrong_topics else "测验复盘"),
            )
            if candidates:
                await self.review_store.add_cards(session_id, candidates, source="quiz")
        except Exception as exc:  # pragma: no cover
            logger.warning("FSRS import failed: %s", exc)

        # Determine if adaptive re-analysis should trigger
        path_updated = False
        if len(wrong_questions) >= WRONG_COUNT_THRESHOLD or accuracy < ACCURACY_THRESHOLD:
            path_updated = True
            logger.info(
                "Adaptive loop triggered for session %s: accuracy=%.1f%%, wrong=%d",
                session_id, accuracy * 100, len(wrong_questions),
            )

        analysis = self._build_analysis(accuracy, wrong_topics, wrong_questions)
        remediation_plan = self._build_remediation_plan(
            accuracy=accuracy,
            wrong_topics=wrong_topics,
            wrong_questions=wrong_questions,
        )

        # xAPI: 把测验提交事件按 LRS 规范持久化（兼容 Tin Can API）
        try:
            get_lrs().emit(
                session_id=session_id,
                verb=("passed" if accuracy >= 0.6 else "failed"),
                object_id=f"quiz/{session_id}",
                object_name="ZhiPath 测验",
                result={
                    "score": {
                        "scaled": round(accuracy, 3),
                        "raw": correct,
                        "min": 0,
                        "max": total,
                    },
                    "completion": True,
                    "success": accuracy >= 0.6,
                },
                context={
                    "extensions": {
                        "https://zhipath.local/x/wrong_topics": wrong_topics,
                    },
                },
            )
        except Exception as exc:  # pragma: no cover
            logger.warning("xAPI emit failed: %s", exc)

        return {
            "total": total,
            "correct": correct,
            "accuracy": round(accuracy, 2),
            "wrong_topics": wrong_topics,
            "analysis": analysis,
            "path_updated": path_updated,
            "remediation_plan": remediation_plan,
            "mastery_snapshot": mastery_snapshot,
            "dkt_snapshot": dkt_snapshot,
            "wrong_indices": wrong_indices,
        }

    @staticmethod
    def _flatten_questions(quiz_data: dict[str, Any]) -> list[dict[str, Any]]:
        questions: list[dict[str, Any]] = []
        for q_type, key in [
            ("single_choice", "single_choice_questions"),
            ("multiple_choice", "multiple_choice_questions"),
            ("true_false", "true_false_questions"),
            ("short_answer", "short_answer_questions"),
        ]:
            for q in quiz_data.get(key, []):
                q["_type"] = q_type
                questions.append(q)
        return questions

    @staticmethod
    def _check_answer(question: dict[str, Any], user_answer: Any) -> bool:
        if user_answer is None:
            return False
        q_type = question.get("_type", "")

        if q_type == "single_choice":
            correct = question.get("correct_option")
            return str(user_answer) == str(correct)

        if q_type == "multiple_choice":
            correct = question.get("correct_options", [])
            if isinstance(user_answer, list):
                return sorted(str(a) for a in user_answer) == sorted(str(c) for c in correct)
            return False

        if q_type == "true_false":
            correct = question.get("correct_answer")
            if isinstance(user_answer, bool):
                return user_answer == correct
            return str(user_answer).lower() == str(correct).lower()

        if q_type == "short_answer":
            expected = question.get("expected_answer", "")
            return str(user_answer).strip().lower() == str(expected).strip().lower()

        return False

    @staticmethod
    def _extract_wrong_topics(wrong_questions: list[dict[str, Any]]) -> list[str]:
        topics: list[str] = []
        seen: set[str] = set()
        for q in wrong_questions:
            # Use the question text as a topic indicator (first 30 chars)
            topic = q.get("question", "")[:30].strip()
            if topic and topic not in seen:
                seen.add(topic)
                topics.append(topic)
        return topics[:5]

    @staticmethod
    def _build_analysis(accuracy: float, wrong_topics: list[str], wrong_questions: list[dict[str, Any]]) -> str:
        pct = int(accuracy * 100)
        lines = [f"本次正确率：{pct}%"]
        if wrong_topics:
            lines.append(f"薄弱知识点：{', '.join(wrong_topics)}")
        if pct >= 80:
            lines.append("表现良好，继续保持！")
        elif pct >= 60:
            lines.append("部分知识点需要加强复习。")
        else:
            lines.append("建议重新学习相关知识点后再试。")
        return "\n".join(lines)

    @staticmethod
    def _build_remediation_plan(
        accuracy: float,
        wrong_topics: list[str],
        wrong_questions: list[dict[str, Any]],
    ) -> dict[str, Any]:
        pct = int(accuracy * 100)
        if pct >= 85:
            mastery = "掌握良好"
            strategy = "进入进阶迁移练习"
            priority = "low"
        elif pct >= 60:
            mastery = "部分掌握"
            strategy = "针对错题知识点做短周期补救"
            priority = "medium"
        else:
            mastery = "需要补救"
            strategy = "回到微讲义和基础题，重新建立概念框架"
            priority = "high"

        error_patterns = QuizFeedbackService._infer_error_patterns(wrong_questions)
        target_topics = wrong_topics or ["当前测验主题"]
        focus_topics = target_topics[:3]

        next_tasks = [
            f"复盘错题主题：{topic}" for topic in focus_topics
        ]
        if pct < 60:
            next_tasks.insert(0, "先重读资源包中的微讲义，标记不理解的概念")
        next_tasks.extend([
            "生成 5 道同类基础题，要求每题带解析",
            "完成后再次提交答案，观察薄弱点是否减少",
        ])

        resource_actions = [
            {
                "type": "micro_lecture",
                "label": "补救微讲义",
                "prompt": f"围绕{focus_topics[0]}生成一份通俗微讲义，包含概念、例子和易错点。",
            },
            {
                "type": "quiz",
                "label": "同类巩固题",
                "prompt": f"针对{', '.join(focus_topics)}生成 5 道补救练习题，并给出答案解析。",
            },
            {
                "type": "flashcards",
                "label": "间隔复习卡片",
                "prompt": f"把{', '.join(focus_topics)}整理成 5 张问答复习卡片。",
            },
        ]

        return {
            "mastery_level": mastery,
            "priority": priority,
            "strategy": strategy,
            "target_topics": focus_topics,
            "error_patterns": error_patterns,
            "next_tasks": next_tasks,
            "resource_actions": resource_actions,
            "acceptance_criteria": [
                "补救题正确率达到 80% 以上",
                "能口头解释每个错题对应的知识点",
                "下一轮画像中的薄弱点数量减少或变得更具体",
            ],
        }

    @staticmethod
    def _infer_error_patterns(wrong_questions: list[dict[str, Any]]) -> list[str]:
        patterns: list[str] = []
        type_counts: dict[str, int] = {}
        for question in wrong_questions:
            q_type = question.get("_type", "unknown")
            type_counts[q_type] = type_counts.get(q_type, 0) + 1

        if type_counts.get("single_choice", 0) or type_counts.get("multiple_choice", 0):
            patterns.append("概念辨析或选项干扰识别不足")
        if type_counts.get("true_false", 0):
            patterns.append("定义边界和判断条件不稳定")
        if type_counts.get("short_answer", 0):
            patterns.append("表达组织或步骤化说明不足")
        if len(wrong_questions) >= WRONG_COUNT_THRESHOLD:
            patterns.append("同一轮测验错误较集中，需要降低难度并做分层补救")
        return patterns or ["暂无明显错因模式"]
