"""Backward-compatible prompt loader for skill_requirement_mapper.

Loads from YAML registry (prompts/registry/skill_gap/skill_requirement_mapper.yaml).
"""
from __future__ import annotations

import logging

from prompts import get_prompt

logger = logging.getLogger(__name__)

_system_tmpl = get_prompt("skill_requirement_mapper", "system")
_task_tmpl = get_prompt("skill_requirement_mapper", "task")

skill_requirement_mapper_system_prompt: str = _system_tmpl.content if _system_tmpl else ""
skill_requirement_mapper_task_prompt: str = _task_tmpl.content if _task_tmpl else ""

logger.debug("skill_requirement_mapper prompts loaded from registry v%s", _system_tmpl.version if _system_tmpl else "?")
