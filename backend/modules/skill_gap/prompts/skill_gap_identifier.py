"""Backward-compatible prompt loader for skill_gap_identifier.

Loads from YAML registry (prompts/registry/skill_gap/skill_gap_identifier.yaml).
"""
from __future__ import annotations

import logging

from prompts import get_prompt

logger = logging.getLogger(__name__)

_system_tmpl = get_prompt("skill_gap_identifier", "system")
_task_tmpl = get_prompt("skill_gap_identifier", "task")

skill_gap_identifier_system_prompt: str = _system_tmpl.content if _system_tmpl else ""
skill_gap_identifier_task_prompt: str = _task_tmpl.content if _task_tmpl else ""

logger.debug("skill_gap_identifier prompts loaded from registry v%s", _system_tmpl.version if _system_tmpl else "?")
