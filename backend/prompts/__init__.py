"""Prompt Registry — version-managed prompt templates loaded from YAML.

Design goals:
  1. All prompts live in YAML files under prompts/registry/
  2. Each prompt has version, description, and template variables
  3. Backward-compatible: existing imports still work
  4. Git-trackable: prompt changes are visible in diff

Usage:
  from prompts import get_prompt

  tmpl = get_prompt("chat_tutor", "system")
  print(tmpl.content)       # the prompt text
  print(tmpl.version)       # "1.0.0"
  print(tmpl.variables)     # ["learner_profile", ...]
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

logger = logging.getLogger(__name__)

_REGISTRY_DIR = Path(__file__).parent / "registry"

# ── Data structures ──────────────────────────────────────────────────────


@dataclass
class PromptTemplate:
    """A single versioned prompt template."""

    name: str                               # e.g. "chat_tutor"
    role: str                               # "system" | "task_initialization" | "task_update" | ...
    content: str                            # the prompt text
    version: str = "1.0.0"
    description: str = ""
    variables: list[str] = field(default_factory=list)

    def format(self, **kwargs: Any) -> str:
        """Format the prompt with template variables."""
        return self.content.format(**kwargs)


@dataclass
class PromptModule:
    """A collection of prompts for one module (loaded from one YAML file)."""

    name: str
    version: str = "1.0.0"
    description: str = ""
    prompts: dict[str, PromptTemplate] = field(default_factory=dict)

    def get(self, role: str) -> PromptTemplate | None:
        return self.prompts.get(role)

    def __getitem__(self, role: str) -> PromptTemplate:
        return self.prompts[role]


# ── Registry (lazy-loaded singleton) ─────────────────────────────────────

_registry: dict[str, PromptModule] = {}


def _load_yaml(path: Path) -> PromptModule:
    """Load a single YAML prompt file into a PromptModule."""
    with open(path, encoding="utf-8") as f:
        raw = yaml.safe_load(f)

    module_name = raw.get("module", path.stem)
    module_version = str(raw.get("version", "1.0.0"))
    module_desc = raw.get("description", "")

    prompts: dict[str, PromptTemplate] = {}
    for role, entry in raw.get("prompts", {}).items():
        if not isinstance(entry, dict):
            continue
        content = entry.get("content", "")
        # Handle nested output_format references
        output_format = entry.get("output_format", "")
        if output_format and "{output_format}" in content:
            content = content.replace("{output_format}", output_format)

        prompts[role] = PromptTemplate(
            name=module_name,
            role=role,
            content=content.strip(),
            version=str(entry.get("version", module_version)),
            description=entry.get("description", ""),
            variables=entry.get("variables", []),
        )

    return PromptModule(
        name=module_name,
        version=module_version,
        description=module_desc,
        prompts=prompts,
    )


def _load_all() -> dict[str, PromptModule]:
    """Load all YAML files from the registry directory."""
    modules: dict[str, PromptModule] = {}
    if not _REGISTRY_DIR.exists():
        logger.warning("Prompt registry directory not found: %s", _REGISTRY_DIR)
        return modules

    # Load from top-level and subdirectories
    yaml_files = list(_REGISTRY_DIR.glob("*.yaml")) + list(_REGISTRY_DIR.rglob("*.yaml"))
    for path in yaml_files:
        try:
            module = _load_yaml(path)
            modules[module.name] = module
            logger.debug("Loaded prompt module: %s (v%s, %d prompts)", module.name, module.version, len(module.prompts))
        except Exception as exc:
            logger.error("Failed to load prompt file %s: %s", path, exc)

    return modules


def get_registry() -> dict[str, PromptModule]:
    """Get the full prompt registry (lazy-loaded)."""
    if not _registry:
        _registry.update(_load_all())
        logger.info("Prompt registry loaded: %d modules", len(_registry))
    return _registry


def get_prompt(module: str, role: str) -> PromptTemplate | None:
    """Get a specific prompt template by module and role."""
    reg = get_registry()
    mod = reg.get(module)
    if mod is None:
        return None
    return mod.get(role)


def get_module(module: str) -> PromptModule | None:
    """Get an entire prompt module."""
    return get_registry().get(module)


def list_modules() -> list[str]:
    """List all registered module names."""
    return list(get_registry().keys())


def reload():
    """Force reload all prompts from YAML files."""
    _registry.clear()
    get_registry()
