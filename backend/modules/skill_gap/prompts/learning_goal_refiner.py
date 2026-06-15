"""Backward-compatible prompt loader for learning_goal_refiner.

Loads from YAML registry (prompts/registry/skill_gap/learning_goal_refiner.yaml).
"""
from __future__ import annotations

import logging

from prompts import get_prompt

logger = logging.getLogger(__name__)

_system_tmpl = get_prompt("learning_goal_refiner", "system")
_task_tmpl = get_prompt("learning_goal_refiner", "task")

learning_goal_refiner_system_prompt: str = _system_tmpl.content if _system_tmpl else ""
learning_goal_refiner_task_prompt: str = _task_tmpl.content if _task_tmpl else ""

logger.debug("learning_goal_refiner prompts loaded from registry v%s", _system_tmpl.version if _system_tmpl else "?")
