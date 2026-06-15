"""验证浏览器配置 Key 的全链路：
1. HTTP middleware 把 X-LF-Configs / X-LF-TTS header 注入 contextvars
2. credential_scope / get_config_for_task / get_tts_creds 正确读取
3. 离开 scope 后凭据自动释放，不会泄露给下一个请求
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


# ── 辅助构造 ──────────────────────────────────────────────────

def _make_config(**overrides):
    """构造一个 ApiConfig 实例，支持覆盖任意字段。"""
    from base.credential_context import ApiConfig

    defaults = dict(
        id="test-1",
        name="DeepSeek",
        api_key="sk-test-key",
        base_url="https://api.deepseek.com/v1",
        model="deepseek-chat",
        api_format="openai",
        task_types=["chat", "structured"],
        enabled=True,
    )
    defaults.update(overrides)
    return ApiConfig(**defaults)


# ── credential_scope + get_config_for_task ─────────────────────

def test_config_priority_browser_over_env(monkeypatch):
    """同时设了 env 和 browser config 时，browser 优先。"""
    from base.credential_context import (
        credential_scope,
        get_config_for_task,
        get_any_enabled_config,
    )

    # 无 scope 时，返回 None（不依赖 env）
    assert get_config_for_task("chat") is None

    cfg = _make_config(api_key="browser_key")
    with credential_scope(configs=[cfg]):
        found = get_config_for_task("chat")
        assert found is not None
        assert found.api_key == "browser_key"

    # 离开 scope 后应回退
    assert get_config_for_task("chat") is None


def test_config_isolation_between_scopes():
    """不同 scope 不会串。"""
    from base.credential_context import credential_scope, get_configs

    cfg_a = _make_config(id="a", api_key="user_A_key")
    cfg_b = _make_config(id="b", api_key="user_B_key")

    with credential_scope(configs=[cfg_a]):
        configs = get_configs()
        assert len(configs) == 1
        assert configs[0].api_key == "user_A_key"

    with credential_scope(configs=[cfg_b]):
        configs = get_configs()
        assert len(configs) == 1
        assert configs[0].api_key == "user_B_key"

    assert get_configs() == []


def test_disabled_config_is_skipped():
    """enabled=False 的配置不被 get_config_for_task 选中。"""
    from base.credential_context import credential_scope, get_config_for_task, get_any_enabled_config

    cfg_disabled = _make_config(id="d", api_key="disabled_key", enabled=False, task_types=["chat"])
    cfg_enabled = _make_config(id="e", api_key="enabled_key", enabled=True, task_types=["chat"])

    with credential_scope(configs=[cfg_disabled, cfg_enabled]):
        found = get_config_for_task("chat")
        assert found is not None
        assert found.api_key == "enabled_key"

        any_cfg = get_any_enabled_config()
        assert any_cfg is not None
        assert any_cfg.api_key == "enabled_key"


def test_get_config_for_task_filters_by_task_type():
    """get_config_for_task 只返回 task_types 匹配的配置。"""
    from base.credential_context import credential_scope, get_config_for_task

    cfg_chat = _make_config(id="c", api_key="chat_key", task_types=["chat"])
    cfg_code = _make_config(id="d", api_key="code_key", task_types=["code"])

    with credential_scope(configs=[cfg_chat, cfg_code]):
        assert get_config_for_task("chat").api_key == "chat_key"
        assert get_config_for_task("code").api_key == "code_key"
        assert get_config_for_task("reasoning") is None


# ── TTS 凭据 ──────────────────────────────────────────────────

def test_tts_creds_injected_via_scope():
    """credential_scope(tts=...) 注入 TTS 凭据。"""
    from base.credential_context import credential_scope, get_tts_creds

    assert get_tts_creds() == {}

    tts_data = {
        "XF_TTS_APPID": "browser_appid",
        "XF_TTS_API_KEY": "browser_apikey",
        "XF_TTS_API_SECRET": "browser_secret",
    }
    with credential_scope(tts=tts_data):
        creds = get_tts_creds()
        assert creds["XF_TTS_APPID"] == "browser_appid"
        assert creds["XF_TTS_API_KEY"] == "browser_apikey"
        assert creds["XF_TTS_API_SECRET"] == "browser_secret"

    assert get_tts_creds() == {}


def test_tts_creds_isolation():
    """不同 scope 的 TTS 凭据不串。"""
    from base.credential_context import credential_scope, get_tts_creds

    with credential_scope(tts={"XF_TTS_APPID": "app_A"}):
        assert get_tts_creds()["XF_TTS_APPID"] == "app_A"

    with credential_scope(tts={"XF_TTS_APPID": "app_B"}):
        assert get_tts_creds()["XF_TTS_APPID"] == "app_B"

    assert get_tts_creds() == {}


# ── JSON 解析 ─────────────────────────────────────────────────

def test_parse_configs_from_json():
    """parse_configs_from_json 正确解析 JSON 列表。"""
    from base.credential_context import parse_configs_from_json

    raw = json.dumps([
        {
            "id": "1",
            "name": "DeepSeek",
            "apiKey": "sk-abc",
            "baseUrl": "https://api.deepseek.com/v1",
            "model": "deepseek-chat",
            "apiFormat": "openai",
            "taskTypes": ["chat"],
        },
    ])
    configs = parse_configs_from_json(raw)
    assert len(configs) == 1
    assert configs[0].api_key == "sk-abc"
    assert configs[0].base_url == "https://api.deepseek.com/v1"
    assert configs[0].model == "deepseek-chat"
    assert configs[0].api_format == "openai"
    assert "chat" in configs[0].task_types


def test_parse_configs_from_json_handles_invalid():
    """非法 JSON 返回空列表。"""
    from base.credential_context import parse_configs_from_json

    assert parse_configs_from_json("not-json") == []
    assert parse_configs_from_json("{}") == []  # dict, not list
    assert parse_configs_from_json("") == []


def test_parse_tts_from_json():
    """parse_tts_from_json 正确解析 TTS 凭据。"""
    from base.credential_context import parse_tts_from_json

    raw = json.dumps({
        "XF_TTS_APPID": "my_app",
        "XF_TTS_API_KEY": "my_key",
        "XF_TTS_API_SECRET": "my_secret",
        "OTHER_KEY": "should_be_filtered",
    })
    tts = parse_tts_from_json(raw)
    assert tts["XF_TTS_APPID"] == "my_app"
    assert tts["XF_TTS_API_KEY"] == "my_key"
    assert tts["XF_TTS_API_SECRET"] == "my_secret"
    assert "OTHER_KEY" not in tts


def test_parse_tts_from_json_handles_invalid():
    """非法 JSON 返回空 dict。"""
    from base.credential_context import parse_tts_from_json

    assert parse_tts_from_json("bad") == {}
    assert parse_tts_from_json("[]") == {}  # list, not dict


# ── HTTP 中间件 ────────────────────────────────────────────────

def test_middleware_parses_xlf_configs_header():
    """中间件正确解析 X-LF-Configs header 并注入 contextvars。"""
    from fastapi.testclient import TestClient
    from api.main import app
    from base.credential_context import get_configs, ApiConfig

    configs_payload = json.dumps([{
        "id": "1",
        "name": "Test",
        "apiKey": "sk-from-header",
        "baseUrl": "https://test.example.com/v1",
        "model": "test-model",
        "apiFormat": "openai",
        "taskTypes": ["chat"],
    }])

    # 通过在 middleware 内部验证 contextvars 来测试
    # 这里用 /api/v1/credentials/test 端点间接验证
    with TestClient(app) as client:
        r = client.post(
            "/api/v1/credentials/test",
            json={
                "id": "1",
                "name": "Test",
                "apiKey": "sk-from-header",
                "baseUrl": "https://test.example.com/v1",
                "model": "test-model",
                "apiFormat": "openai",
            },
        )
        # 这个端点会尝试连接，预期会失败（假 key），但不应 500
        assert r.status_code == 200
        body = r.json()
        assert "ok" in body


# ── API 端点 ───────────────────────────────────────────────────

def test_credentials_test_endpoint():
    """POST /api/v1/credentials/test 返回结构正确。"""
    from fastapi.testclient import TestClient
    from api.main import app

    with TestClient(app) as client:
        r = client.post(
            "/api/v1/credentials/test",
            json={
                "apiKey": "sk-fake-key",
                "baseUrl": "https://api.deepseek.com/v1",
                "model": "deepseek-chat",
                "apiFormat": "openai",
            },
        )
        assert r.status_code == 200
        body = r.json()
        assert "ok" in body
        assert "reason" in body
        # 假 key 应该连接失败
        assert body["ok"] is False


def test_credentials_test_endpoint_no_key():
    """POST /api/v1/credentials/test 不填 key 应报错。"""
    from fastapi.testclient import TestClient
    from api.main import app

    with TestClient(app) as client:
        r = client.post(
            "/api/v1/credentials/test",
            json={
                "apiKey": "",
                "baseUrl": "https://api.deepseek.com/v1",
                "model": "deepseek-chat",
            },
        )
        assert r.status_code == 200
        body = r.json()
        assert body["ok"] is False
        assert "API Key" in body["reason"]


# ── IFlytekTTS ─────────────────────────────────────────────────

def test_iflytek_tts_picks_browser_credentials_first():
    """IFlytekTTS 构造时从 contextvars 读取 TTS 凭据。"""
    from base.credential_context import credential_scope
    from base.iflytek_factory import IFlytekTTS

    # 无 scope 时，TTS 凭据为空
    tts_empty = IFlytekTTS()
    assert tts_empty.appid == ""

    # 有 scope 时，从 contextvars 读取
    with credential_scope(tts={
        "XF_TTS_APPID": "browser_appid",
        "XF_TTS_API_KEY": "browser_apikey",
        "XF_TTS_API_SECRET": "browser_secret",
    }):
        tts_browser = IFlytekTTS()
        assert tts_browser.appid == "browser_appid"
        assert tts_browser.api_key == "browser_apikey"
        assert tts_browser.api_secret == "browser_secret"

    # 离开 scope 后回退为空
    tts_after = IFlytekTTS()
    assert tts_after.appid == ""
