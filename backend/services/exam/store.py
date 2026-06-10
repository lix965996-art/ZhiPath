from __future__ import annotations

import json
import logging
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "exams"

QUESTION_GROUPS: list[tuple[str, str, str]] = [
    ("single_choice", "single_choice_questions", "选择题"),
    ("multiple_choice", "multiple_choice_questions", "多选题"),
    ("true_false", "true_false_questions", "判断题"),
    ("short_answer", "short_answer_questions", "简答题"),
]


class ExamStore:
    """测验 JSON → 规范化试题 → 写磁盘；标题学科由 _infer_topic（本轮原话优先于画像 topics）决定。"""

    def __init__(self) -> None:
        DATA_DIR.mkdir(parents=True, exist_ok=True)

    async def create_from_quiz(
        self,
        session_id: str,
        quiz_data: dict[str, Any],
        learner_profile: dict[str, Any] | None = None,
        source_prompt: str = "",
    ) -> dict[str, Any] | None:
        questions = self._normalize_questions(quiz_data)
        if not questions:
            return None

        profile = learner_profile or {}
        topic = self._infer_topic(profile, source_prompt)
        exam_id = f"exam_{uuid.uuid4().hex[:12]}"
        total_score = 100
        duration = self._estimate_duration(questions)
        self._assign_scores(questions, total_score)

        exam = {
            "id": exam_id,
            "session_id": session_id,
            "title": f"{topic}个性化测试卷",
            "subject": self._infer_subject(topic),
            "topic": topic,
            "duration_minutes": duration,
            "total_score": total_score,
            "questions": questions,
            "source_prompt": source_prompt,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }

        self._write_exam(exam)
        self._latest_path(session_id).write_text(
            json.dumps({"exam_id": exam_id}, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        logger.info("Saved exam %s for session %s", exam_id, session_id)
        return exam

    async def get_exam(self, exam_id: str) -> dict[str, Any] | None:
        path = self._exam_path(exam_id)
        if not path.exists():
            return None
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            logger.warning("Skipping corrupted exam file: %s", path)
            return None
        return data if isinstance(data, dict) else None

    async def get_latest_exam(self, session_id: str) -> dict[str, Any] | None:
        latest_path = self._latest_path(session_id)
        if latest_path.exists():
            try:
                latest = json.loads(latest_path.read_text(encoding="utf-8"))
                exam_id = str(latest.get("exam_id", ""))
                if exam_id:
                    return await self.get_exam(exam_id)
            except json.JSONDecodeError:
                logger.warning("Skipping corrupted latest exam file: %s", latest_path)

        exams: list[dict[str, Any]] = []
        for path in DATA_DIR.glob("exam_*.json"):
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                continue
            if data.get("session_id") == session_id:
                exams.append(data)
        if not exams:
            return None
        exams.sort(key=lambda item: str(item.get("created_at", "")), reverse=True)
        return exams[0]

    @staticmethod
    def _normalize_questions(quiz_data: dict[str, Any]) -> list[dict[str, Any]]:
        questions: list[dict[str, Any]] = []
        for q_type, key, section in QUESTION_GROUPS:
            for index, raw in enumerate(quiz_data.get(key, []) or [], start=1):
                question_text = str(raw.get("question", "")).strip()
                if not question_text:
                    continue

                answer: Any = ""
                if q_type == "single_choice":
                    answer = raw.get("correct_option", "")
                elif q_type == "multiple_choice":
                    answer = raw.get("correct_options", raw.get("correct_option", []))
                elif q_type == "true_false":
                    answer = bool(raw.get("correct_answer", False))
                elif q_type == "short_answer":
                    answer = raw.get("expected_answer", raw.get("correct_answer", ""))

                questions.append(
                    {
                        "id": f"{q_type}_{index}",
                        "type": q_type,
                        "section": section,
                        "score": 0,
                        "question": question_text,
                        "options": [str(option) for option in raw.get("options", []) or []],
                        "answer": answer,
                        "explanation": str(raw.get("explanation", "")).strip(),
                        "knowledge_point": ExamStore._infer_knowledge_point(question_text),
                    },
                )
        return questions

    @staticmethod
    def _assign_scores(questions: list[dict[str, Any]], total_score: int) -> None:
        base = total_score // len(questions)
        remainder = total_score - base * len(questions)
        for index, question in enumerate(questions):
            question["score"] = base + (1 if index < remainder else 0)

    @staticmethod
    def _estimate_duration(questions: list[dict[str, Any]]) -> int:
        duration = 0
        for question in questions:
            if question["type"] in {"single_choice", "true_false"}:
                duration += 3
            elif question["type"] == "multiple_choice":
                duration += 4
            else:
                duration += 8
        return max(20, min(120, duration))

    @staticmethod
    def _topic_from_source_prompt(source_prompt: str) -> str | None:
        """Prefer the subject the user names in *this* turn (earliest match in prompt).

        Historically `_infer_topic` used the *last* entry in `profile["topics"]`, which
        stays stale when the user switches subject (e.g. 数学卷子 after earlier 英语).
        """
        text = (source_prompt or "").strip()
        if not text:
            return None
        candidates = [
            "高等数学",
            "数学分析",
            "线性代数",
            "概率统计",
            "机器学习",
            "深度学习",
            "监督学习",
            "无监督学习",
            "动态规划",
            "Python",
            "算法",
            "英语",
            "语文",
            "数学",
            "物理",
            "化学",
            "生物",
            "历史",
            "地理",
            "政治",
        ]
        lower = text.lower()
        best: str | None = None
        best_pos = len(text) + 1
        for c in candidates:
            pos = lower.find(c.lower()) if c.isascii() else text.find(c)
            if pos == -1:
                continue
            if pos < best_pos or (pos == best_pos and len(c) > len(best or "")):
                best = c
                best_pos = pos
        return best[:24] if best else None

    @staticmethod
    def _infer_topic(profile: dict[str, Any], source_prompt: str) -> str:
        from_prompt = ExamStore._topic_from_source_prompt(source_prompt)
        if from_prompt:
            return from_prompt

        topics = profile.get("topics")
        if isinstance(topics, list):
            for topic in reversed(topics):
                text = str(topic).strip()
                if text:
                    return text[:24]

        known_topics = [
            "动态规划",
            "机器学习",
            "深度学习",
            "监督学习",
            "无监督学习",
            "Python",
            "线性代数",
            "概率统计",
            "算法",
            "数学",
            "英语",
            "语文",
        ]
        lower = source_prompt.lower()
        for topic in known_topics:
            if topic.lower() in lower:
                return topic
        return "个性化学习"

    @staticmethod
    def _infer_subject(topic: str) -> str:
        if topic in {"动态规划", "算法", "Python"}:
            return "计算机"
        if topic in {"机器学习", "深度学习", "监督学习", "无监督学习"}:
            return "人工智能"
        if topic in {"线性代数", "概率统计", "数学", "高等数学", "数学分析"}:
            return "数学"
        if topic in {"英语", "语文", "物理", "化学", "生物", "历史", "地理", "政治"}:
            return topic
        return "综合学习"

    @staticmethod
    def _infer_knowledge_point(question: str) -> str:
        cleaned = re.sub(r"[？?。！!，,：:\s]+", "", question)
        return cleaned[:18] or "综合知识点"

    @staticmethod
    def _exam_path(exam_id: str) -> Path:
        safe_id = re.sub(r"[^a-zA-Z0-9_-]", "", exam_id)
        return DATA_DIR / f"{safe_id}.json"

    @staticmethod
    def _latest_path(session_id: str) -> Path:
        safe_id = re.sub(r"[^a-zA-Z0-9_-]", "", session_id)
        return DATA_DIR / f"latest_{safe_id}.json"

    def _write_exam(self, exam: dict[str, Any]) -> None:
        self._exam_path(str(exam["id"])).write_text(
            json.dumps(exam, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
