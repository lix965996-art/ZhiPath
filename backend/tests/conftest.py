from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# Ensure backend is on path
sys.path.insert(0, str(Path(__file__).parent.parent))


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="session")
def mock_llm():
    """Create a mock LLM that returns predictable responses."""
    llm = MagicMock()

    def mock_invoke(messages, **kwargs):
        response = MagicMock()
        response.content = '{"result": "test response"}'
        return response

    async def mock_ainvoke(messages, **kwargs):
        response = MagicMock()
        response.content = '{"result": "test response"}'
        return response

    async def mock_astream(messages, **kwargs):
        chunks = ["测试", "响应", "内容"]
        for chunk_text in chunks:
            chunk = MagicMock()
            chunk.content = chunk_text
            yield chunk

    llm.invoke = mock_invoke
    llm.ainvoke = mock_ainvoke
    llm.astream = mock_astream
    return llm


@pytest.fixture
def test_session_id():
    return "test-session-001"
