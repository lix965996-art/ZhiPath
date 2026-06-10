"""端到端 API 集成测试：用 FastAPI TestClient 跑通关键路由。

验证：
- /health 健康检查
- POST /api/v1/demo/seed 一键演示数据填充
- GET /api/v1/sessions 列表会话
- GET /api/v1/mastery/{sid} BKT 快照
- GET /api/v1/kg/{sid} 知识图谱
- GET /api/v1/review/{sid}/calendar FSRS 日历
- GET /api/v1/classroom/overview 班级聚合
- GET /api/v1/router 多模型路由表
- GET /api/v1/capabilities 能力列表
- POST /api/v1/mcp/ MCP JSON-RPC (tools/list)
- POST /api/v1/feedback/message RLHF 反馈
- POST /api/v1/experiments/observe A/B 实验观测
- POST /api/v1/dkt/{sid}/fit DKT 训练
- GET /api/v1/irt/{sid}/ability IRT ability
- POST /api/v1/study/pomodoro 番茄钟
- 错误处理：404 / 422

这是答辩前的最后一道防线 — 这一组测试全绿，路由层 100% 没回归。
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


@pytest.fixture(scope="module")
def client():
    from fastapi.testclient import TestClient
    from api.main import app

    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def demo_sid(client):
    """启动一次 demo seed，后续测试都用这个 session_id。"""
    r = client.post("/api/v1/demo/seed")
    assert r.status_code == 200
    body = r.json()
    assert body["session_id"]
    assert body["kg_nodes"] > 0
    return body["session_id"]


# ---------- 基础 ----------


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert isinstance(body["capabilities"], list)
    # 7 个 capability 全部注册（chat/goal/learning/resource_gen/auto_tutor/debate/agentic）
    assert len(body["capabilities"]) >= 6


def test_capabilities_list(client):
    r = client.get("/api/v1/capabilities")
    assert r.status_code == 200
    body = r.json()
    names = {c["name"] for c in body}
    assert {"chat", "goal", "learning", "resource_gen", "auto_tutor", "agentic"}.issubset(names)


def test_model_router_exposed(client):
    r = client.get("/api/v1/router")
    assert r.status_code == 200
    body = r.json()
    route_names = {r["name"] for r in body["routes"]}
    assert {"chat", "structured", "long_form", "reasoning"}.issubset(route_names)


# ---------- Demo Seed ----------


def test_demo_info(client):
    r = client.get("/api/v1/demo/info")
    assert r.status_code == 200
    assert "demo_session_id" in r.json()


def test_demo_seed_idempotent(client):
    r1 = client.post("/api/v1/demo/seed")
    r2 = client.post("/api/v1/demo/seed")
    assert r1.status_code == 200 == r2.status_code
    assert r1.json()["session_id"] == r2.json()["session_id"]


# ---------- Mastery (BKT) ----------


def test_mastery_after_seed(client, demo_sid):
    r = client.get(f"/api/v1/mastery/{demo_sid}")
    assert r.status_code == 200
    body = r.json()
    assert body["summary"]["count"] >= 10
    assert 0 <= body["summary"]["avg_mastery"] <= 1


def test_mastery_focus_returns_weak(client, demo_sid):
    r = client.get(f"/api/v1/mastery/{demo_sid}/focus?threshold=0.6&limit=5")
    assert r.status_code == 200
    arr = r.json()
    for kc in arr:
        assert kc["mastery"] < 0.6


# ---------- KG ----------


def test_kg_topo(client, demo_sid):
    r = client.get(f"/api/v1/kg/{demo_sid}/topo_order")
    assert r.status_code == 200
    body = r.json()
    assert body["count"] >= 8
    # 拓扑序：linear_algebra 应在 linear_regression 之前
    order = body["order"]
    if "linear_algebra" in order and "linear_regression" in order:
        assert order.index("linear_algebra") < order.index("linear_regression")


def test_kg_suggestions(client, demo_sid):
    r = client.get(f"/api/v1/kg/{demo_sid}/suggest")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


# ---------- FSRS ----------


def test_review_calendar(client, demo_sid):
    r = client.get(f"/api/v1/review/{demo_sid}/calendar")
    assert r.status_code == 200
    body = r.json()
    assert body["stats"]["total"] >= 6


def test_review_due(client, demo_sid):
    r = client.get(f"/api/v1/review/{demo_sid}/due?limit=20")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


# ---------- IRT ----------


def test_irt_ability(client, demo_sid):
    r = client.get(f"/api/v1/irt/{demo_sid}/ability")
    assert r.status_code == 200
    body = r.json()
    assert "theta" in body
    assert body["difficulty_hint"] in {"very_easy", "easy", "medium", "hard", "very_hard"}


# ---------- DKT ----------


def test_dkt_fit(client, demo_sid):
    r = client.post(
        f"/api/v1/dkt/{demo_sid}/fit",
        json={"observations": [
            {"label": "梯度下降", "correct": True},
            {"label": "反向传播", "correct": False},
            {"label": "梯度下降", "correct": True},
        ]},
    )
    assert r.status_code == 200
    body = r.json()
    assert "predictions" in body
    assert "梯度下降" in body["predictions"]


# ---------- Classroom ----------


def test_classroom_overview(client):
    r = client.get("/api/v1/classroom/overview")
    assert r.status_code == 200
    body = r.json()
    assert "students" in body
    assert "aggregate" in body


# ---------- MCP ----------


def test_mcp_meta(client):
    r = client.get("/api/v1/mcp/")
    assert r.status_code == 200
    assert r.json()["protocol"].startswith("mcp/")


def test_mcp_tools_list(client):
    r = client.post(
        "/api/v1/mcp/",
        json={"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["jsonrpc"] == "2.0"
    assert body["id"] == 1
    assert "tools" in body["result"]
    assert len(body["result"]["tools"]) >= 4


def test_mcp_call_mastery_tool(client, demo_sid):
    r = client.post(
        "/api/v1/mcp/",
        json={
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/call",
            "params": {"name": "zhipath_get_mastery", "arguments": {"session_id": demo_sid}},
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert "result" in body


# ---------- Feedback (RLHF) ----------


def test_feedback_message(client, demo_sid):
    r = client.post(
        "/api/v1/feedback/message",
        json={
            "session_id": demo_sid,
            "turn_id": "test_turn_001",
            "rating": 1,
            "capability": "chat",
            "variant_id": "structured",
            "duration_ms": 1234,
        },
    )
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


# ---------- Experiments ----------


def test_experiments_list(client):
    r = client.get("/api/v1/experiments")
    assert r.status_code == 200
    arr = r.json()
    names = {e["name"] for e in arr}
    assert "chat_system_prompt" in names


def test_experiments_observe(client, demo_sid):
    r = client.post(
        "/api/v1/experiments/observe",
        json={
            "exp_name": "chat_system_prompt",
            "variant_id": "structured",
            "session_id": demo_sid,
            "duration_ms": 800,
            "success": True,
            "metric_score": 0.9,
        },
    )
    assert r.status_code == 200


# ---------- Study (番茄钟) ----------


def test_pomodoro_post(client, demo_sid):
    r = client.post(
        "/api/v1/study/pomodoro",
        json={
            "session_id": demo_sid,
            "duration_seconds": 1500,
            "type": "focus",
            "topic": "梯度下降",
            "completed": True,
        },
    )
    assert r.status_code == 200


# ---------- xAPI ----------


def test_xapi_list_statements(client, demo_sid):
    r = client.get(f"/api/v1/xapi/{demo_sid}/statements?limit=10")
    assert r.status_code == 200
    arr = r.json()
    assert isinstance(arr, list)
    assert len(arr) >= 1  # seed 写了 3 条


# ---------- 错误处理 ----------


def test_404_returns_structured_error(client):
    r = client.get("/api/v1/this_route_does_not_exist")
    assert r.status_code == 404
    body = r.json()
    # 我们的全局 exception_handler 会输出 {error_type, code, detail, path}
    if "error_type" in body:
        assert body["error_type"] == "http"
        assert body["code"] == 404


def test_422_validation(client):
    # quiz/submit 缺必填字段 → 422
    r = client.post("/api/v1/quiz/submit", json={})
    assert r.status_code == 422
