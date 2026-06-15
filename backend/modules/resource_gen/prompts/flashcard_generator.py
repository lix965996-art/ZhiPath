"""Backward-compatible prompt loader for flashcard_generator.

Loads from YAML registry (prompts/registry/resource_gen/flashcard.yaml).
"""
from __future__ import annotations

import logging

from prompts import get_prompt

logger = logging.getLogger(__name__)

_system_tmpl = get_prompt("flashcard_generator", "system")
_task_tmpl = get_prompt("flashcard_generator", "task")

flashcard_generator_system_prompt: str = _system_tmpl.content if _system_tmpl else ""
flashcard_generator_task_prompt: str = _task_tmpl.content if _task_tmpl else ""

logger.debug("flashcard_generator prompts loaded from registry v%s", _system_tmpl.version if _system_tmpl else "?")
