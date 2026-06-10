"""单轮能力路由：context.active_capability → Registry → capability.run(context, bus)。

每轮一个 StreamBus 订阅流；断开连接时取消后台 capability 任务。能力清单在 api/main.create_app 注册。
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from typing import AsyncIterator

from core.context import UnifiedContext
from core.events import StreamEvent, EventType
from core.stream_bus import StreamBus
from runtime.registry import get_capability_registry

logger = logging.getLogger(__name__)


class ChatOrchestrator:
    """按 UnifiedContext.active_capability 选择能力；未知能力回退 chat；异常经 bus.error 传出。"""

    def __init__(self) -> None:
        self._cap_registry = get_capability_registry()

    async def handle(self, context: UnifiedContext) -> AsyncIterator[StreamEvent]:
        """Execute a single user turn and yield streaming events."""
        if not context.session_id:
            context.session_id = str(uuid.uuid4())

        cap_name = context.active_capability or "chat"
        capability = self._cap_registry.get(cap_name)

        if capability is None:
            fallback = self._cap_registry.get("chat")
            if fallback is not None:
                logger.warning("Capability %s not found, falling back to chat", cap_name)
                cap_name = "chat"
                capability = fallback

        if capability is None:
            # Yield error/done directly without StreamBus lifecycle issues
            yield StreamEvent(type=EventType.ERROR, content=f"Unknown capability: {cap_name}", source="orchestrator")
            yield StreamEvent(type=EventType.DONE, content="", source="orchestrator")
            return

        # Emit session metadata
        yield StreamEvent(
            type=EventType.SESSION,
            content="",
            source="orchestrator",
            metadata={"session_id": context.session_id},
        )

        bus = StreamBus()
        capability_done = False

        async def _run() -> None:
            nonlocal capability_done
            try:
                await capability.run(context, bus)
            except Exception as exc:
                logger.error("Capability %s failed: %s", cap_name, exc, exc_info=True)
                bus.error(str(exc), source=cap_name)
            finally:
                capability_done = True
                # Only emit done if capability didn't already do it
                if not bus.is_done:
                    bus.done()
                bus.close()

        stream = bus.subscribe()
        task = asyncio.create_task(_run())

        try:
            async for event in stream:
                yield event
        except Exception:
            # WebSocket disconnect or other error — cancel the capability task
            task.cancel()
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass
            return

        # Wait for task to finish normally
        try:
            await task
        except Exception:
            pass

    def list_capabilities(self) -> list[str]:
        return self._cap_registry.list_capabilities()
