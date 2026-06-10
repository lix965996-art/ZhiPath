from __future__ import annotations

import logging
from typing import Any

from capabilities.base import BaseCapability

logger = logging.getLogger(__name__)

_default_registry: CapabilityRegistry | None = None


class CapabilityRegistry:
    """Registry for capability instances."""

    def __init__(self) -> None:
        self._capabilities: dict[str, BaseCapability] = {}

    def register(self, capability: BaseCapability) -> None:
        name = capability.name
        self._capabilities[name] = capability
        logger.info("Registered capability: %s", name)

    def get(self, name: str) -> BaseCapability | None:
        return self._capabilities.get(name)

    def list_capabilities(self) -> list[str]:
        return list(self._capabilities.keys())

    def get_manifests(self) -> list[dict[str, Any]]:
        return [
            {
                "name": cap.name,
                "description": cap.manifest.description,
                "stages": cap.manifest.stages,
            }
            for cap in self._capabilities.values()
        ]


def get_capability_registry() -> CapabilityRegistry:
    global _default_registry
    if _default_registry is None:
        _default_registry = CapabilityRegistry()
    return _default_registry
