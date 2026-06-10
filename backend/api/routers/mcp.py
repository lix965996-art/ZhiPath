"""轻量 MCP (Model Context Protocol) Server endpoint。

把 ZhiPath 的若干能力封装成 MCP 工具，外部 Agent（Claude Desktop、Codex 等）
可以通过 MCP 标准接入，调用 ZhiPath 的 BKT/FSRS/KG/资源生成等能力。

实现要点：
- 走 JSON-RPC 2.0 over HTTP（MCP 最简形态）
- 支持 tools/list 和 tools/call 两个核心方法
- 不依赖 mcp-sdk，纯 FastAPI 路由实现，方便容器化部署

要进一步对接 stdio/SSE 传输，可在前端加个代理（pipe 到 stdio）。
"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Request

from services.knowledge_graph import KnowledgeGraph
from services.mastery import MasteryStore, mastery_to_theta, recommend_difficulty
from services.srs import ReviewStore

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/mcp", tags=["mcp"])

# 工具注册表
TOOLS = [
    {
        "name": "zhipath_get_mastery",
        "description": "查询某 session 的知识点掌握度（BKT 贝叶斯）",
        "inputSchema": {
            "type": "object",
            "required": ["session_id"],
            "properties": {
                "session_id": {"type": "string", "description": "ZhiPath session ID"},
            },
        },
    },
    {
        "name": "zhipath_get_review_due",
        "description": "查询某 session 的 FSRS 待复习卡片",
        "inputSchema": {
            "type": "object",
            "required": ["session_id"],
            "properties": {
                "session_id": {"type": "string"},
                "limit": {"type": "integer", "default": 20},
            },
        },
    },
    {
        "name": "zhipath_get_knowledge_graph",
        "description": "查询某 session 的知识图谱（含前后置依赖）",
        "inputSchema": {
            "type": "object",
            "required": ["session_id"],
            "properties": {
                "session_id": {"type": "string"},
            },
        },
    },
    {
        "name": "zhipath_recommend_difficulty",
        "description": "基于 IRT ability 给出推荐题目难度档位",
        "inputSchema": {
            "type": "object",
            "required": ["session_id"],
            "properties": {
                "session_id": {"type": "string"},
            },
        },
    },
]


@router.get("/")
async def mcp_meta() -> dict[str, Any]:
    """返回 MCP server 元信息（非 JSON-RPC，方便检查）。"""
    return {
        "protocol": "mcp/jsonrpc-1.0",
        "server_name": "ZhiPath MCP",
        "version": "0.1.0",
        "tools_count": len(TOOLS),
    }


@router.post("/")
async def mcp_jsonrpc(request: Request) -> dict[str, Any]:
    payload = await request.json()
    method = payload.get("method", "")
    req_id = payload.get("id")
    params = payload.get("params", {}) or {}

    try:
        if method == "tools/list":
            return _ok(req_id, {"tools": TOOLS})

        if method == "tools/call":
            name = params.get("name")
            arguments = params.get("arguments", {}) or {}
            result = await _dispatch_tool(name, arguments)
            return _ok(req_id, {
                "content": [{"type": "text", "text": str(result)}],
                "isError": False,
            })

        if method == "initialize":
            return _ok(req_id, {
                "protocolVersion": "1.0",
                "capabilities": {"tools": {"listChanged": False}},
                "serverInfo": {"name": "ZhiPath", "version": "0.1.0"},
            })

        return _err(req_id, -32601, f"method not found: {method}")
    except Exception as exc:  # pragma: no cover
        logger.exception("MCP dispatch failed: %s", exc)
        return _err(req_id, -32603, str(exc))


async def _dispatch_tool(name: str, args: dict[str, Any]) -> Any:
    sid = str(args.get("session_id", ""))
    if not sid:
        return {"error": "session_id required"}

    if name == "zhipath_get_mastery":
        return await MasteryStore().get_mastery(sid)
    if name == "zhipath_get_review_due":
        limit = int(args.get("limit", 20))
        return await ReviewStore().query_due(sid, limit=limit)
    if name == "zhipath_get_knowledge_graph":
        return await KnowledgeGraph().get(sid)
    if name == "zhipath_recommend_difficulty":
        snap = await MasteryStore().get_mastery(sid)
        theta = mastery_to_theta(snap.get("summary", {}).get("avg_mastery", 0.3))
        return {
            "theta": round(theta, 3),
            "difficulty_hint": recommend_difficulty(theta),
        }
    return {"error": f"unknown tool: {name}"}


def _ok(req_id: Any, result: Any) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": req_id, "result": result}


def _err(req_id: Any, code: int, message: str) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": req_id, "error": {"code": code, "message": message}}
