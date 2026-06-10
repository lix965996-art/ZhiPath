from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

from core.context import UnifiedContext
from core.stream_bus import StreamBus


@dataclass
class CapabilityManifest:
    """Static metadata for a capability."""
    name: str
    description: str
    stages: list[str] = field(default_factory=list)
    tools_used: list[str] = field(default_factory=list)


class BaseCapability(ABC):
    """Abstract base for all capabilities.

    Subclasses must provide ``manifest`` and implement ``run``.
    """

    manifest: CapabilityManifest

    @abstractmethod
    async def run(self, context: UnifiedContext, stream: StreamBus) -> None:
        """Execute the full capability pipeline, emitting events to stream."""
        ...

    @property
    def name(self) -> str:
        return self.manifest.name
