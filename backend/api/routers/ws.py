"""WebSocket 聊天入口：单轮内固定顺序组装 UnifiedContext 后交给 ChatOrchestrator。"""
from __future__ import annotations

import asyncio
import json
import logging
import uuid

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from base.credential_context import (
    ApiConfig,
    reset_configs,
    reset_tts_creds,
    set_configs,
    set_tts_creds,
    TTS_KEYS,
)
from core.context import UnifiedContext
from core.events import EventType
from runtime.orchestrator import ChatOrchestrator
from services.guardrail import check_content_safety
from services.knowledge_graph import KnowledgeGraph
from services.session.store import SessionStore
from services.memory.service import MemoryService
from services.profile import LearningProfileService
from services.rag.graph_rag import GraphRAG
from services.rag.pipeline import RAGPipeline
from services.rag.smart_retriever import SmartRetriever
from services.tracing import span as tracing_span, trace_scope

logger = logging.getLogger(__name__)

router = APIRouter(tags=["websocket"])
orchestrator = ChatOrchestrator()
session_store = SessionStore()
memory_service = MemoryService()
profile_service = LearningProfileService()
_rag_pipeline: RAGPipeline | None = None


def _get_rag_pipeline() -> RAGPipeline:
    global _rag_pipeline
    if _rag_pipeline is None:
        _rag_pipeline = RAGPipeline()
    return _rag_pipeline


_graph_rag: GraphRAG | None = None
_smart_retriever: SmartRetriever | None = None
_kg_service: KnowledgeGraph | None = None


def _get_graph_rag() -> GraphRAG:
    global _graph_rag, _kg_service
    if _graph_rag is None:
        if _kg_service is None:
            _kg_service = KnowledgeGraph()
        _graph_rag = GraphRAG(rag=_get_rag_pipeline(), kg=_kg_service)
    return _graph_rag


def _get_smart_retriever() -> SmartRetriever:
    global _smart_retriever, _kg_service
    if _smart_retriever is None:
        if _kg_service is None:
            _kg_service = KnowledgeGraph()
        _smart_retriever = SmartRetriever(rag=_get_rag_pipeline(), kg=_kg_service)
    return _smart_retriever


@router.websocket("/api/v1/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    logger.info("WebSocket connected")

    # 整条 WS 连接共用的用户配置
    ws_configs: list[ApiConfig] = []
    ws_tts: dict[str, str] = {}
    current_task: asyncio.Task | None = None

    try:
        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await ws.send_json({"type": "error", "content": "Invalid JSON"})
                continue

            msg_type = msg.get("type", "message")

            if msg_type in ("init", "set_credentials"):
                # 客户端发送配置更新
                raw_configs = msg.get("configs") or msg.get("credentials") or []
                if isinstance(raw_configs, list):
                    ws_configs = [
                        ApiConfig.from_dict(item)
                        for item in raw_configs
                        if isinstance(item, dict)
                    ]

                raw_tts = msg.get("tts") or {}
                if isinstance(raw_tts, dict):
                    ws_tts = {
                        k: str(v).strip()
                        for k, v in raw_tts.items()
                        if k in TTS_KEYS and str(v or "").strip()
                    }

                # 可选：验证 auth token
                ws_user = None
                token = msg.get("token")
                if token:
                    from services.auth import get_token_info
                    info = get_token_info(token)
                    if info:
                        ws_user = info
                        logger.info("WebSocket authenticated: %s", info.get("username"))

                await ws.send_json({
                    "type": "credentials_ack",
                    "config_count": len(ws_configs),
                    "tts_configured": bool(ws_tts),
                    "authenticated": ws_user is not None,
                })
                continue

            if msg_type in ("message", "start_turn"):
                # 注入配置到 contextvars
                cfg_token = set_configs(ws_configs) if ws_configs else None
                tts_token = set_tts_creds(ws_tts) if ws_tts else None
                try:
                    current_task = asyncio.create_task(_handle_turn(ws, msg))
                    await current_task
                except asyncio.CancelledError:
                    await ws.send_json({"type": "done"})
                finally:
                    current_task = None
                    if cfg_token is not None:
                        reset_configs(cfg_token)
                    if tts_token is not None:
                        reset_tts_creds(tts_token)
            elif msg_type == "ping":
                await ws.send_json({"type": "pong"})
            elif msg_type == "cancel_turn":
                if current_task and not current_task.done():
                    current_task.cancel()
                await ws.send_json({"type": "done"})
            else:
                await ws.send_json({"type": "error", "content": f"Unknown message type: {msg_type}"})

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected")
    except Exception as exc:
        logger.error("WebSocket error: %s", exc, exc_info=True)
        try:
            await ws.send_json({"type": "error", "content": str(exc)})
            await ws.send_json({"type": "done"})
        except Exception:
            pass


async def _handle_turn(ws: WebSocket, msg: dict) -> None:
    """单轮对话：顺序组装上下文后交给编排器。"""
    user_message = msg.get("content", "").strip()
    session_id = msg.get("session_id", "")
    capability = msg.get("capability", "chat")

    if not user_message:
        await ws.send_json({"type": "error", "content": "消息内容不能为空"})
        await ws.send_json({"type": "done"})
        return

    # 1) 会话
    if not session_id:
        session = await session_store.create_session(title=user_message[:30])
        session_id = session["id"]

    # 2) 落库用户消息
    await session_store.add_message(session_id, "user", user_message)

    # 2.5) 输入安全检查
    if not await _check_safety(ws, user_message):
        return

    # 3) 画像
    learner_profile = await profile_service.update_from_user_message(
        session_id=session_id,
        message=user_message,
        capability=capability,
    )
    await _send_profile_evidence(ws, learner_profile)

    # 4) 记忆上下文
    memory_context = await _build_memory_context(session_id)

    # 5) SmartRetriever
    knowledge_context = await _build_knowledge_context(ws, session_id, user_message)

    # 6) 历史
    history = await _build_history(session_id)

    # 7) 编排器
    context = UnifiedContext(
        session_id=session_id,
        user_message=user_message,
        active_capability=capability,
        conversation_history=history,
        memory_context=memory_context,
        knowledge_context=knowledge_context,
        learner_profile=learner_profile,
        learning_goal=learner_profile.get("learning_goal") or None,
    )

    # 8/9) 下发 session_id + 流式转发
    await ws.send_json({"type": "session", "session_id": session_id})
    assistant_response = await _stream_orchestrator(ws, context, session_id, capability, user_message)

    if assistant_response:
        await session_store.add_message(session_id, "assistant", assistant_response)


async def _check_safety(ws: WebSocket, user_message: str) -> bool:
    """输入安全检查，返回 True 表示安全可继续。"""
    safety = check_content_safety(user_message)
    if not safety.safe:
        await ws.send_json({
            "type": "guardrail",
            "severity": safety.severity,
            "reason": safety.reason,
            "matched": safety.matched,
        })
        await ws.send_json({
            "type": "stream",
            "content": "抱歉，您的提问命中了内容安全策略，我无法处理这一请求。请调整提问。",
        })
        await ws.send_json({"type": "done"})
        return False
    return True


async def _send_profile_evidence(ws: WebSocket, learner_profile: dict) -> None:
    """发送画像增量事件。"""
    new_evidence = [
        entry
        for entry in learner_profile.get("evidence_log", [])
        if entry.get("turn") == learner_profile.get("turn_count")
    ]
    for entry in new_evidence:
        await ws.send_json({
            "type": "profile_update",
            "dimension": entry.get("dimension"),
            "value": entry.get("value"),
            "evidence": entry.get("snippet"),
            "turn": entry.get("turn"),
        })


async def _build_memory_context(session_id: str) -> str:
    """组装记忆上下文。"""
    parts = [
        await profile_service.build_context(session_id),
        await memory_service.build_memory_context(session_id),
    ]
    return "\n\n".join(part for part in parts if part)


async def _build_knowledge_context(ws: WebSocket, session_id: str, user_message: str) -> str:
    """SmartRetriever 检索知识上下文。"""
    cited = await _get_smart_retriever().build_cited_context(session_id, user_message)
    if cited.has_context:
        await ws.send_json({
            "type": "sources",
            "sources": cited.sources,
            "low_confidence": cited.low_confidence,
            "graph_enhanced": True,
            "smart_retrieved": True,
        })
    return cited.text


async def _build_history(session_id: str) -> list[dict]:
    """构建对话历史。"""
    session = await session_store.get_session(session_id)
    if not session:
        return []
    return [
        {"role": m["role"], "content": m["content"]}
        for m in session["messages"][:-1]
    ]


async def _forward_event(ws: WebSocket, event) -> None:
    """将单个编排器事件转发为 WebSocket JSON 消息。"""
    if event.type == EventType.SESSION:
        return
    elif event.type == EventType.CONTENT:
        await ws.send_json({"type": "stream", "content": event.content})
    elif event.type == EventType.THINKING:
        await ws.send_json({"type": "thinking", "content": event.content})
    elif event.type == EventType.ERROR:
        await ws.send_json({"type": "error", "content": event.content})
    elif event.type == EventType.DONE:
        await ws.send_json({"type": "done", "trace_id": event.turn_id})
    elif event.type == EventType.RESULT:
        await ws.send_json({"type": "result", "content": event.content, "source": event.source})
    elif event.type == EventType.STAGE_START:
        await ws.send_json({"type": "stage_start", "stage": event.stage})
    elif event.type == EventType.STAGE_END:
        await ws.send_json({"type": "stage_end", "stage": event.stage})
    elif event.type == EventType.TOOL_CALL:
        await ws.send_json({
            "type": "tool_call",
            "source": event.source,
            "content": event.content,
            "metadata": event.metadata,
        })
    elif event.type == EventType.TOOL_RESULT:
        await ws.send_json({
            "type": "tool_result",
            "source": event.source,
            "content": event.content,
            "metadata": event.metadata,
        })
    elif event.type == EventType.AGENT_MESSAGE:
        await ws.send_json({
            "type": "agent_message",
            "from": event.source,
            "to": event.metadata.get("to"),
            "label": event.metadata.get("label"),
            "payload": event.metadata.get("payload"),
        })
    elif event.type == EventType.PROFILE_UPDATE:
        await ws.send_json({
            "type": "profile_update",
            "dimension": event.metadata.get("dimension"),
            "value": event.content,
            "evidence": event.metadata.get("evidence"),
        })
    elif event.type == EventType.LOOP_STEP:
        await ws.send_json({
            "type": "loop_step",
            "step": event.content,
            "status": event.metadata.get("status"),
            "metadata": event.metadata,
        })
    elif event.type == EventType.SOURCES:
        await ws.send_json({
            "type": "sources",
            "sources": event.metadata.get("sources", []),
            "low_confidence": event.metadata.get("low_confidence", False),
        })
    elif event.type == EventType.CREDENTIAL_HEALTH:
        await ws.send_json({
            "type": "credential_health",
            "status": event.content,
            "source": event.source,
            "error_code": event.metadata.get("error_code"),
            "message": event.metadata.get("message"),
        })


async def _stream_orchestrator(
    ws: WebSocket, context: UnifiedContext, session_id: str, capability: str, user_message: str
) -> str:
    """运行编排器并流式转发事件，返回助手回复文本。"""
    turn_id = str(uuid.uuid4())
    assistant_chunks: list[str] = []

    await ws.send_json({"type": "trace_start", "trace_id": turn_id})

    with trace_scope(turn_id):
        with tracing_span(
            name=f"turn:{capability}",
            kind="internal",
            attributes={
                "session_id": session_id,
                "capability": capability,
                "user_message_preview": user_message[:120],
            },
        ):
            async for event in orchestrator.handle(context):
                event.session_id = session_id
                event.turn_id = turn_id

                if event.type == EventType.CONTENT:
                    assistant_chunks.append(event.content)

                await _forward_event(ws, event)

    return "".join(assistant_chunks).strip()
