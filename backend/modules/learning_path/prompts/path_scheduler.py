"""Backward-compatible prompt loader for learning_path.

Loads prompts from YAML registry (prompts/registry/learning_path.yaml).
"""
from __future__ import annotations

import logging

from prompts import get_prompt

logger = logging.getLogger(__name__)

_system_tmpl = get_prompt("learning_path", "system")
_task_session_tmpl = get_prompt("learning_path", "task_session")
_task_reflexion_tmpl = get_prompt("learning_path", "task_reflexion")
_task_reschedule_tmpl = get_prompt("learning_path", "task_reschedule")
_output_tmpl = get_prompt("learning_path", "output_format")

learning_path_output_format: str = _output_tmpl.content if _output_tmpl else ""
learning_path_scheduler_system_prompt: str = _system_tmpl.content if _system_tmpl else ""
learning_path_scheduler_task_prompt_session: str = _task_session_tmpl.content if _task_session_tmpl else ""
learning_path_scheduler_task_prompt_reflexion: str = _task_reflexion_tmpl.content if _task_reflexion_tmpl else ""
learning_path_scheduler_task_prompt_reschedule: str = _task_reschedule_tmpl.content if _task_reschedule_tmpl else ""

logger.debug("learning_path prompts loaded from registry v%s", _system_tmpl.version if _system_tmpl else "?")
