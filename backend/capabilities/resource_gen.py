"""resource_gen 能力：并行 Quiz/Flashcard/Mindmap → 试卷与资源包 → 可选二次 LLM 总结。

学习文档在有 RAG 时由「本轮用户需求 + 知识库参考」拼接，避免检索片段单独主导命题。
评委说明见 ZhiPath 根目录下 `docs/JUDGE_BRIEF.md`。
"""
from __future__ import annotations

import asyncio
import re
from typing import Any

from base.iflytek_factory import IFlytekTTS, iflytek_tts_available
from base.llm_factory import LLMFactory
from capabilities.base import CapabilityManifest
from capabilities.llm_capability import PromptedLLMCapability
from core.context import UnifiedContext
from core.stream_bus import StreamBus
from services.mastery import mastery_to_theta, recommend_difficulty
from modules.resource_gen.agents.code_lab_generator import generate_code_lab_with_llm
from modules.resource_gen.agents.flashcard_generator import generate_flashcards_with_llm
from modules.resource_gen.agents.kg_generator import generate_kg_with_llm
from modules.resource_gen.agents.mermaid_generator import generate_mermaid_with_llm
from modules.resource_gen.agents.mindmap_generator import generate_mindmap_with_llm
from modules.resource_gen.agents.quiz_generator import generate_quiz_with_llm
from services.knowledge_graph import KnowledgeGraph
from services.mastery import MasteryStore
from services.exam.store import ExamStore
from services.guardrail.citation import extract_citation_sources
from services.quiz.quiz_store import QuizStore
from services.resource_package.store import ResourcePackageStore


SYSTEM_PROMPT = """你是 ZhiPath 的资源构建模块，负责基于学习者画像和知识库上下文生成个性化学习资源。

你的输出要像可交付的学习资源包，而不是普通回答。请按以下结构输出：

## 1. 适配依据
说明本资源如何匹配学生目标、当前基础、薄弱点、偏好和知识库检索结果。

## 2. 微讲义
用清晰结构讲解核心概念。必须包含：
- 概念定义
- 为什么重要
- 常见误区
- 一个通俗例子

## 3. 分层练习
生成基础题、迁移题、挑战题。每道题包含：
- 难度
- 考查点
- 题目
- 答案
- 解析

## 4. 知识结构
给出层级提纲或 Mermaid mindmap，帮助学生建立结构。

## 5. 复习卡片
生成 3-5 张问答卡片，适合间隔复习。

## 6. 后续个性化调整
说明学生完成练习后，系统应该根据哪些表现更新画像和下一步资源。

要求：
- 使用中文。
- 输出完整可用，不要只给目录。
- 如果上下文不足，先给最小可用资源，并标明默认假设。
- 当系统已经生成“可打印试卷”结构化资源时，只说明资源已经生成，并引导用户使用界面下方的“下载试卷 Word / 含答案解析 / 打印 PDF”按钮。
- 禁止建议用户手动复制到 Word/WPS，禁止把 Ctrl+P 当作主要方案，禁止输出“打印与导出建议”这类手工排版说明。
"""


class ResourceGenerationCapability(PromptedLLMCapability):
    manifest = CapabilityManifest(
        name="resource_gen",
        description="个性化讲义、练习题、案例、复习卡片和知识结构生成。",
        stages=["resource_generation"],
        tools_used=["KnowledgeRetriever", "ResourceComposer", "QuizGenerator"],
    )
    system_prompt = SYSTEM_PROMPT
    stage_name = "resource_generation"
    route_task = "long_form"

    async def run(self, context: UnifiedContext, stream: StreamBus) -> None:
        llm = self._resolve_llm(stream)
        agent_results: dict[str, Any] = {}

        learning_doc = context.knowledge_context or context.user_message
        if context.knowledge_context and context.knowledge_context.strip():
            learning_doc = (
                f"【本轮用户需求（命题范围与学科须与此一致）】\n{context.user_message}\n\n"
                f"【知识库参考】\n{context.knowledge_context}"
            )
        profile = context.learner_profile or {}

        # 408 考研场景 → 把上下文注入 learning_doc 顶部
        # 让 6 个生成器（Quiz/Flashcard/MindMap/CodeLab/Mermaid/KG）全部感知, 无需逐 prompt 改
        exam_ctx = profile.get("exam_context") if isinstance(profile, dict) else None
        if exam_ctx and isinstance(exam_ctx, dict) and exam_ctx.get("exam_code"):
            exam_lines = [
                "【408 考研场景上下文 — 必须按以下口径产出资源】",
                f"- 考试代码：{exam_ctx.get('exam_code')}（计算机学科专业基础综合）",
            ]
            if exam_ctx.get("target_school"):
                exam_lines.append(f"- 目标层次：{exam_ctx['target_school']}")
            if exam_ctx.get("exam_stage"):
                exam_lines.append(f"- 复习阶段：{exam_ctx['exam_stage']}")
            if exam_ctx.get("weak_subjects"):
                exam_lines.append(
                    f"- 弱项学科（优先覆盖）：{', '.join(exam_ctx['weak_subjects'])}"
                )
            if exam_ctx.get("exam_date"):
                exam_lines.append(f"- 考试日期：{exam_ctx['exam_date']}")
            exam_lines.extend(
                [
                    "- 资源产出口径：题目用 408 真题风格；术语规范；",
                    "  讲义引用考纲条目；思维导图按真题命题模式分组；",
                    "  代码案例围绕数据结构经典实现（C/C++ 风格优先）。",
                ]
            )
            learning_doc = "\n".join(exam_lines) + "\n\n" + learning_doc

        # IRT 自适应难度：基于 BKT 平均 mastery 估计 ability，给出题目难度建议
        try:
            mastery_snapshot = await MasteryStore().get_mastery(context.session_id)
            avg_m = mastery_snapshot.get("summary", {}).get("avg_mastery", 0.4)
            theta = mastery_to_theta(avg_m)
            difficulty_hint = recommend_difficulty(theta)
            stream.thinking(
                f"IRT 自适应难度：ability θ ≈ {theta:.2f} → 推荐难度 {difficulty_hint}"
            )
            learning_doc = (
                f"【IRT 自适应难度建议：{difficulty_hint} (θ={theta:.2f})】"
                f"请根据该难度生成题目（very_easy / easy / medium / hard / very_hard）。\n\n"
                + learning_doc
            )
        except Exception as exc:
            stream.thinking(f"IRT 估计跳过：{exc}")

        quiz_counts = _infer_quiz_counts(context.user_message)
        exam_export_request = _is_exam_export_request(context.user_message)

        async with stream.stage("resource_generation"):
            # 多个 Generator 并行执行（QuizGenerator / FlashcardGenerator / MindMapGenerator / CodeLabGenerator）
            self._emit_agent_message(
                stream,
                "Orchestrator",
                "QuizGenerator",
                {"counts": quiz_counts, "topic_hint": context.user_message[:60]},
                label="出题需求",
            )
            quiz_task = self._invoke_agent(
                "QuizGenerator",
                lambda **kw: generate_quiz_with_llm(llm, **kw),
                stream,
                learner_profile=profile,
                learning_document=learning_doc,
                single_choice_count=quiz_counts["single_choice"],
                multiple_choice_count=quiz_counts["multiple_choice"],
                true_false_count=quiz_counts["true_false"],
                short_answer_count=quiz_counts["short_answer"],
            )
            self._emit_agent_message(
                stream,
                "Orchestrator",
                "FlashcardGenerator",
                {"length": len(learning_doc)},
                label="闪卡素材",
            )
            flashcard_task = self._invoke_agent(
                "FlashcardGenerator",
                lambda **kw: generate_flashcards_with_llm(llm, **kw),
                stream,
                learning_document=learning_doc,
            )
            self._emit_agent_message(
                stream,
                "Orchestrator",
                "MindMapGenerator",
                {"length": len(learning_doc)},
                label="导图素材",
            )
            mindmap_task = self._invoke_agent(
                "MindMapGenerator",
                lambda **kw: generate_mindmap_with_llm(llm, **kw),
                stream,
                learning_document=learning_doc,
            )
            self._emit_agent_message(
                stream,
                "Orchestrator",
                "CodeLabGenerator",
                {"topic_hint": context.user_message[:60]},
                label="代码实操需求",
            )
            code_lab_task = self._invoke_agent(
                "CodeLabGenerator",
                lambda **kw: generate_code_lab_with_llm(llm, **kw),
                stream,
                learner_profile=profile,
                learning_document=learning_doc,
                user_request=context.user_message,
            )
            self._emit_agent_message(
                stream,
                "Orchestrator",
                "MermaidGenerator",
                {"topic_hint": context.user_message[:60]},
                label="结构化图表需求",
            )
            mermaid_task = self._invoke_agent(
                "MermaidGenerator",
                lambda **kw: generate_mermaid_with_llm(llm, **kw),
                stream,
                learning_goal=context.learning_goal or context.user_message,
                learner_profile=profile,
                learning_document=learning_doc,
            )
            self._emit_agent_message(
                stream,
                "Orchestrator",
                "KGGenerator",
                {"topic_hint": context.user_message[:60]},
                label="知识图谱需求",
            )
            kg_task = self._invoke_agent(
                "KGGenerator",
                lambda **kw: generate_kg_with_llm(llm, **kw),
                stream,
                learning_goal=context.learning_goal or context.user_message,
                learner_profile=profile,
                learning_document=learning_doc,
            )

            quiz, flashcards, mindmap, code_lab, mermaid, kg_data = await asyncio.gather(
                quiz_task, flashcard_task, mindmap_task, code_lab_task, mermaid_task, kg_task,
            )

            # 把 KG 喂给图服务 + 创建对应 BKT KC（让"路径推荐"端到端打通）
            if kg_data and isinstance(kg_data, dict):
                try:
                    kg = KnowledgeGraph()
                    if kg_data.get("nodes"):
                        await kg.upsert_nodes(context.session_id, kg_data["nodes"])
                    if kg_data.get("edges"):
                        await kg.add_edges(context.session_id, kg_data["edges"])
                    # 同步 KC 到 BKT，确保掌握度追踪能查到对应节点
                    kc_labels = [n.get("label") for n in kg_data.get("nodes", []) if n.get("label")]
                    if kc_labels:
                        await MasteryStore().upsert_kcs(context.session_id, kc_labels)
                    self._emit_agent_message(
                        stream,
                        "KGGenerator",
                        "MasteryStore",
                        {"kcs": kc_labels},
                        label="KG → BKT 同步",
                    )
                except Exception as exc:
                    stream.thinking(f"KG 写入失败（已降级）：{exc}")

            exam = None
            if quiz:
                agent_results["测验题目"] = quiz
                await QuizStore().save_quiz(context.session_id, quiz)
                self._emit_agent_message(
                    stream,
                    "QuizGenerator",
                    "ExamStore",
                    {"question_count": _quiz_total(quiz)},
                    label="试卷封装",
                )
                exam = await ExamStore().create_from_quiz(
                    session_id=context.session_id,
                    quiz_data=quiz,
                    learner_profile=profile,
                    source_prompt=context.user_message,
                )
                if exam:
                    agent_results["可打印试卷"] = {
                        "exam_id": exam["id"],
                        "title": exam["title"],
                        "question_count": len(exam["questions"]),
                        "total_score": exam["total_score"],
                        "duration_minutes": exam["duration_minutes"],
                    }
            if flashcards:
                agent_results["复习闪卡"] = flashcards
            if mindmap:
                agent_results["知识结构图"] = mindmap
            if code_lab:
                agent_results["代码实操"] = code_lab
            if mermaid:
                agent_results["结构化图表"] = mermaid
            if kg_data:
                agent_results["知识图谱"] = {
                    "node_count": len(kg_data.get("nodes", [])),
                    "edge_count": len(kg_data.get("edges", [])),
                }

            # 讯飞 TTS：把微讲义同步合成为音频（凭据缺失时优雅降级，不阻塞主流程）
            audio_url = None
            if iflytek_tts_available():
                self._emit_agent_message(
                    stream,
                    "Orchestrator",
                    "iFlytekTTS",
                    {"topic": context.user_message[:30]},
                    label="语音合成",
                )
                stream.thinking("调用讯飞 TTS 合成讲义音频 ...")
                audio_url = await asyncio.to_thread(
                    _safe_tts_synthesize,
                    context.user_message,
                    profile,
                    context.knowledge_context or "",
                )
                if audio_url:
                    stream.thinking("讯飞 TTS 合成完成。")
                    agent_results["讲义音频"] = {"audio_url": audio_url, "provider": "iFlytek"}

            citation_sources = extract_citation_sources(context.knowledge_context or "")

            package = await ResourcePackageStore().create_from_generation(
                session_id=context.session_id,
                source_prompt=context.user_message,
                learner_profile=profile,
                knowledge_context=context.knowledge_context,
                quiz=quiz,
                flashcards=flashcards,
                mindmap=mindmap,
                exam=exam if quiz else None,
                code_lab=code_lab,
                mermaid=mermaid,
                audio_url=audio_url,
                citation_sources=citation_sources,
            )
            agent_results["学习资源包"] = {
                "package_id": package["id"],
                "title": package["title"],
                "asset_count": len(package.get("assets", [])),
                "topic": package["topic"],
            }

        exam_info = agent_results.get("可打印试卷")
        if exam_export_request and isinstance(exam_info, dict):
            package_info = agent_results.get("学习资源包")
            _emit_exam_ready_response(stream, exam_info, package_info if isinstance(package_info, dict) else None)
            return

        await self._run_llm_with_agent_context(context, stream, agent_results)


def _safe_tts_synthesize(user_message: str, profile: dict[str, Any], knowledge_context: str) -> str | None:
    """异步线程内同步调用 TTS：把微讲义脚本合成为音频。"""
    try:
        topic = (profile or {}).get("learning_goal") or user_message
        text = (
            f"本节面向你的学习目标：{topic}。"
            f"我们将围绕核心概念展开讲解，并给出一个通俗例子帮助你建立直觉。\n\n"
            + (knowledge_context[:600] if knowledge_context else "")
        )
        return IFlytekTTS().synthesize(text, filename_hint=user_message[:24])
    except Exception:  # pragma: no cover - 优雅降级
        return None


def _quiz_total(quiz: dict[str, Any]) -> int:
    total = 0
    for key in ("single_choice_questions", "multiple_choice_questions", "true_false_questions", "short_answer_questions"):
        total += len(quiz.get(key, []) or [])
    return total


def _is_exam_export_request(text: str) -> bool:
    """识别「要出卷/要导出试卷」场景；导出类词须与题/卷/考等语境同现，减少误触。"""
    normalized = text.lower()
    paper_markers = [
        "试卷", "卷子", "测试卷", "摸底", "测验", "考题", "真题", "练习题", "习题", "可打印",
    ]
    if any(m in normalized for m in paper_markers):
        return True
    export_markers = ["打印", "pdf", "word", "wps", "导出", "下载试卷", "docx"]
    if not any(m in normalized for m in export_markers):
        return False
    material_hints = ["题", "卷", "答", "考", "测验", "quiz", "exam", "练习", "作答", "解析", "答案", "分"]
    return any(h in normalized for h in material_hints)


def _infer_quiz_counts(text: str) -> dict[str, int]:
    counts = {
        "single_choice": 3,
        "multiple_choice": 0,
        "true_false": 0,
        "short_answer": 0,
    }

    typed_patterns = [
        ("single_choice", r"([0-9一二两三四五六七八九十]+)\s*(?:道|个)?\s*(?:单选题|选择题|选择)"),
        ("multiple_choice", r"([0-9一二两三四五六七八九十]+)\s*(?:道|个)?\s*(?:多选题|多选)"),
        ("true_false", r"([0-9一二两三四五六七八九十]+)\s*(?:道|个)?\s*(?:判断题|判断)"),
        ("short_answer", r"([0-9一二两三四五六七八九十]+)\s*(?:道|个)?\s*(?:简答题|问答题|简答|问答)"),
    ]
    typed_counts: dict[str, int] = {}
    for key, pattern in typed_patterns:
        match = re.search(pattern, text)
        if match:
            typed_counts[key] = _clamp_count(_parse_count(match.group(1)), default=counts[key])

    if typed_counts:
        counts = {key: 0 for key in counts}
        counts.update(typed_counts)
        return counts

    total_match = re.search(r"([0-9一二两三四五六七八九十]+)\s*(?:道|个)\s*(?:题|题目)", text)
    if total_match:
        counts["single_choice"] = _clamp_count(_parse_count(total_match.group(1)), default=counts["single_choice"])
        return counts

    if _is_exam_export_request(text):
        counts.update({
            "single_choice": 5,
            "multiple_choice": 0,
            "true_false": 3,
            "short_answer": 2,
        })

    return counts


def _parse_count(value: str) -> int:
    value = value.strip()
    if value.isdigit():
        return int(value)

    digits = {
        "零": 0,
        "一": 1,
        "二": 2,
        "两": 2,
        "三": 3,
        "四": 4,
        "五": 5,
        "六": 6,
        "七": 7,
        "八": 8,
        "九": 9,
    }
    if value == "十":
        return 10
    if value.startswith("十"):
        return 10 + digits.get(value[1:], 0)
    if "十" in value:
        left, _, right = value.partition("十")
        return digits.get(left, 0) * 10 + digits.get(right, 0)
    return digits.get(value, 0)


def _clamp_count(value: int, default: int) -> int:
    if value <= 0:
        return default
    return min(value, 20)


def _emit_exam_ready_response(
    stream: StreamBus,
    exam_info: dict[str, Any],
    package_info: dict[str, Any] | None = None,
) -> None:
    question_count = exam_info.get("question_count", 0)
    total_score = exam_info.get("total_score", 100)
    duration = exam_info.get("duration_minutes", 45)
    title = exam_info.get("title", "个性化测试卷")
    package_line = ""
    if package_info:
        package_line = f"- 资源包：{package_info.get('title', '已保存学习资源包')}\n"
    stream.content(
        f"已生成结构化试卷资源：**{title}**。\n\n"
        f"- 题量：{question_count} 题\n"
        f"- 满分：{total_score} 分\n"
        f"- 建议时间：{duration} 分钟\n\n"
        f"{package_line}"
        "请使用下方资源卡查看学习资源包，并通过试卷按钮下载 Word、含答案解析版本或打印 PDF。"
    )
