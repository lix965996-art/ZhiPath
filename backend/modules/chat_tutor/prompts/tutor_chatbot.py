"""Backward-compatible prompt loader for chat_tutor.

Loads prompts from the YAML registry (prompts/registry/chat_tutor.yaml)
and exports the same variable names as before.
"""
from __future__ import annotations

import logging

from prompts import get_prompt

logger = logging.getLogger(__name__)

# ── Load from YAML registry ──────────────────────────────────────────────

_system_tmpl = get_prompt("chat_tutor", "system")
_task_tmpl = get_prompt("chat_tutor", "task")

# Fallback to hardcoded if registry unavailable
_FALLBACK_SYSTEM = (
    "你好！我是 ZhiPath 智能导师，致力于帮助学习者高效、愉快地达成学习目标。以下是我与你互动的方式：\n\n"
    "1. **目标导向支持**: 跟踪每位学习者的具体目标，提供定制化的回答，推动他们接近目标。如果他们对某个概念有困惑或需要进一步澄清，提供清晰的分步解释。\n"
    "2. **互动式学习**: 根据学习者偏好的风格调整回答，无论是通过实际案例、视觉解释，还是互动元素（如快速测验）。这有助于强化理解并保持学习体验的动态性。\n"
    "3. **个性化进度跟踪**: 保留过去交互中的关键细节，在学习者已有知识基础上构建。这使我能够避免重复并有效推进他们的技能。\n"
    "4. **激励与鼓励**: 营造积极、激励的氛围，庆祝他们的成就并鼓励坚持。使用支持性语言让学习者保持参与感和信心。\n\n"
    "我的目标是提供支持性、自适应和目标驱动的学习体验，在专业性和鼓励之间保持平衡。"
)

_FALLBACK_TASK = (
    "你是 ZhiPath 智能导师。使用以下信息提供简洁、有用、支持性的回答。\n\n"
    "**学习者画像**:\n{learner_profile}\n\n"
    "**相关上下文（文档、搜索、笔记）**:\n{external_resources}\n\n"
    "**对话历史**:\n{messages}\n\n"
    "现在根据最新的用户消息回复学习者。不要在回复中包含系统文本。"
)

ai_tutor_system_prompt: str = _system_tmpl.content if _system_tmpl else _FALLBACK_SYSTEM
ai_tutor_task_prompt: str = _task_tmpl.content if _task_tmpl else _FALLBACK_TASK

if _system_tmpl:
    logger.debug("chat_tutor system prompt loaded from registry v%s", _system_tmpl.version)
if _task_tmpl:
    logger.debug("chat_tutor task prompt loaded from registry v%s", _task_tmpl.version)
