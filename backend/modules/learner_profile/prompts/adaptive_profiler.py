"""Backward-compatible prompt loader for learner_profile.

Loads prompts from YAML registry (prompts/registry/learner_profile.yaml).
Exports the same variable names as before.
"""
from __future__ import annotations

import logging

from prompts import get_prompt

logger = logging.getLogger(__name__)

# ── Load from YAML registry ──────────────────────────────────────────────

_system_tmpl = get_prompt("learner_profile", "system")
_task_init_tmpl = get_prompt("learner_profile", "task_initialization")
_task_update_tmpl = get_prompt("learner_profile", "task_update")
_output_tmpl = get_prompt("learner_profile", "output_format")

learner_profile_output_format: str = _output_tmpl.content if _output_tmpl else ""

# System prompt = base + task chain + requirements (all in one YAML system entry)
adaptive_learner_profiler_system_prompt: str = _system_tmpl.content if _system_tmpl else ""

adaptive_learner_profiler_task_prompt_initialization: str = (
    _task_init_tmpl.content if _task_init_tmpl else ""
)
adaptive_learner_profiler_task_prompt_update: str = (
    _task_update_tmpl.content if _task_update_tmpl else ""
)

logger.debug(
    "learner_profile prompts loaded from registry (system v%s, init v%s, update v%s)",
    _system_tmpl.version if _system_tmpl else "?",
    _task_init_tmpl.version if _task_init_tmpl else "?",
    _task_update_tmpl.version if _task_update_tmpl else "?",
)
