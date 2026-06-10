"""验证浏览器配置 Key 的全链路：
1. HTTP middleware 把 X-LF-* header 注入 contextvars
2. LLMFactory / IFlytekTTS 优先读 contextvars，回退 env
3. 离开 scope 后凭据自动释放，不会泄露给下一个请求
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def test_credential_priority_browser_over_env(monkeypatch):
    """同时设了 env 和 browser 时，browser 优先。"""
    from base.credential_context import credential_scope, get_credential

    monkeypatch.setenv("DEEPSEEK_API_KEY", "env_key")
    assert get_credential("DEEPSEEK_API_KEY") == "env_key"

    with credential_scope({"DEEPSEEK_API_KEY": "browser_key"}):
        assert get_credential("DEEPSEEK_API_KEY") == "browser_key"

    # 离开 scope 后应回退 env
    assert get_credential("DEEPSEEK_API_KEY") == "env_key"


def test_credential_source_reflects_priority(monkeypatch):
    from base.credential_context import credential_scope, credential_source

    monkeypatch.delenv("XF_SPARK_API_PASSWORD", raising=False)

    assert credential_source("XF_SPARK_API_PASSWORD") == "missing"

    with credential_scope({"XF_SPARK_API_PASSWORD": "my_browser_password"}):
        assert credential_source("XF_SPARK_API_PASSWORD") == "browser"

    monkeypatch.setenv("XF_SPARK_API_PASSWORD", "env_password")
    assert credential_source("XF_SPARK_API_PASSWORD") == "env"


def test_credential_isolation_between_scopes(monkeypatch):
    """不同 scope 不会串。"""
    from base.credential_context import credential_scope, get_credential

    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)

    with credential_scope({"DEEPSEEK_API_KEY": "user_A"}):
        assert get_credential("DEEPSEEK_API_KEY") == "user_A"

    with credential_scope({"DEEPSEEK_API_KEY": "user_B"}):
        assert get_credential("DEEPSEEK_API_KEY") == "user_B"

    assert get_credential("DEEPSEEK_API_KEY") is None


def test_unsupported_keys_are_filtered():
    """非白名单 key 不应被 contextvars 接收。"""
    from base.credential_context import credential_scope, get_credential

    with credential_scope({"DEEPSEEK_API_KEY": "ok", "SOMETHING_RANDOM": "evil"}):
        assert get_credential("DEEPSEEK_API_KEY") == "ok"
        # 非白名单：返回 None 或 env 的（这里 env 没设）
        assert get_credential("SOMETHING_RANDOM") in (None, "")


def test_header_to_contextvars_mapping():
    """HTTP X-LF-* header 名应正确映射回 env_var。"""
    from api.middleware.credentials import parse_credentials_from_headers

    headers = {
        "x-lf-deepseek-key": "sk-deepseek-123",
        "x-lf-xf-spark-password": "spark-pw-xyz",
        "x-lf-xf-tts-appid": "tts_app",
        "unrelated-header": "should-be-ignored",
    }
    out = parse_credentials_from_headers(headers)
    assert out["DEEPSEEK_API_KEY"] == "sk-deepseek-123"
    assert out["XF_SPARK_API_PASSWORD"] == "spark-pw-xyz"
    assert out["XF_TTS_APPID"] == "tts_app"
    assert "unrelated-header" not in out


def test_credentials_status_endpoint(monkeypatch):
    """GET /api/v1/credentials/status 返回结构正确且不泄露 key 本体。"""
    from fastapi.testclient import TestClient
    from api.main import app

    monkeypatch.setenv("DEEPSEEK_API_KEY", "env_secret_should_not_leak")
    with TestClient(app) as client:
        r = client.get("/api/v1/credentials/status")
        assert r.status_code == 200
        body = r.json()
        # 永不返回 key 本体
        assert "env_secret_should_not_leak" not in r.text
        # 但应反映出 DEEPSEEK_API_KEY 来自 env
        items = {item["key"]: item for item in body["items"]}
        assert items["DEEPSEEK_API_KEY"]["source"] in {"env", "browser"}


def test_credentials_via_header_overrides_env(monkeypatch):
    """请求带 X-LF-* header 时，credentials/status 应显示 browser。"""
    from fastapi.testclient import TestClient
    from api.main import app

    monkeypatch.setenv("DEEPSEEK_API_KEY", "env_key")
    with TestClient(app) as client:
        r = client.get(
            "/api/v1/credentials/status",
            headers={"X-LF-Deepseek-Key": "header_key_user_supplied"},
        )
        assert r.status_code == 200
        body = r.json()
        items = {item["key"]: item for item in body["items"]}
        assert items["DEEPSEEK_API_KEY"]["source"] == "browser"
        # Key 本体绝不返回
        assert "header_key_user_supplied" not in r.text


def test_user_can_override_base_url_and_model(monkeypatch):
    """用户可以在前端配 DEEPSEEK_BASE_URL / DEEPSEEK_MODEL 覆盖 yaml 默认。"""
    from base.credential_context import credential_scope, get_overrides_for

    with credential_scope({
        "DEEPSEEK_API_KEY": "sk-xxx",
        "DEEPSEEK_BASE_URL": "https://my-proxy.example.com/v1",
        "DEEPSEEK_MODEL": "deepseek-reasoner",
    }):
        base_url, model = get_overrides_for("DEEPSEEK_API_KEY")
        assert base_url == "https://my-proxy.example.com/v1"
        assert model == "deepseek-reasoner"


def test_overrides_optional_one_can_be_set_alone(monkeypatch):
    """只填 model 不填 url 也能生效（反之亦然）。"""
    from base.credential_context import credential_scope, get_overrides_for

    monkeypatch.delenv("DASHSCOPE_BASE_URL", raising=False)
    monkeypatch.delenv("DASHSCOPE_MODEL", raising=False)

    with credential_scope({"DASHSCOPE_MODEL": "qwen-max-latest"}):
        base_url, model = get_overrides_for("DASHSCOPE_API_KEY")
        assert base_url is None
        assert model == "qwen-max-latest"


def test_header_map_includes_base_url_and_model():
    """HTTP header 映射必须覆盖三件套（key + url + model）。"""
    from api.middleware.credentials import parse_credentials_from_headers

    headers = {
        "x-lf-deepseek-key": "sk-key",
        "x-lf-deepseek-base-url": "https://api.deepseek.com",
        "x-lf-deepseek-model": "deepseek-reasoner",
    }
    out = parse_credentials_from_headers(headers)
    assert out["DEEPSEEK_API_KEY"] == "sk-key"
    assert out["DEEPSEEK_BASE_URL"] == "https://api.deepseek.com"
    assert out["DEEPSEEK_MODEL"] == "deepseek-reasoner"


def test_iflytek_tts_picks_browser_credentials_first(monkeypatch):
    """IFlytekTTS 构造时应优先读 contextvars，回退 env。"""
    from base.credential_context import credential_scope
    from base.iflytek_factory import IFlytekTTS

    monkeypatch.setenv("XF_TTS_APPID", "env_appid")
    monkeypatch.setenv("XF_TTS_API_KEY", "env_apikey")
    monkeypatch.setenv("XF_TTS_API_SECRET", "env_secret")

    tts_env = IFlytekTTS()
    assert tts_env.appid == "env_appid"

    with credential_scope({
        "XF_TTS_APPID": "browser_appid",
        "XF_TTS_API_KEY": "browser_apikey",
        "XF_TTS_API_SECRET": "browser_secret",
    }):
        tts_browser = IFlytekTTS()
        assert tts_browser.appid == "browser_appid"
        assert tts_browser.api_key == "browser_apikey"
        assert tts_browser.api_secret == "browser_secret"
