"""科大讯飞能力工厂：星火 LLM（OpenAI 兼容）+ 超拟人 TTS。

赛题《2026 中国软件杯 A3》"实现条件"要求：开发过程中使用的其他 AI 辅助工具，
需选用科大讯飞相关工具。本模块统一封装两类调用：

- 星火大模型 (Spark 4.0 / Lite)：用作多智能体协同中可选 LLM 通道（OpenAI 兼容 SDK）。
- 在线 TTS：把"微讲义"等文本资源转成音频文件，沉淀到资源包中（多模态资源）。

凭据从环境变量读取：
    XF_SPARK_API_PASSWORD   - 星火 OpenAI 兼容 SDK 的 API key（控制台一键复制）
    XF_TTS_APPID            - TTS WebSocket APPID
    XF_TTS_API_KEY          - TTS WebSocket APIKey
    XF_TTS_API_SECRET       - TTS WebSocket APISecret

若凭据缺失，TTS 会返回 None 并被资源生成流程优雅降级（不阻塞主流程）。
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import os
import re
import time
import uuid
from datetime import datetime, timezone
from email.utils import formatdate
from pathlib import Path
from typing import Optional
from urllib.parse import urlencode, urlparse

from base.credential_context import get_credential

logger = logging.getLogger(__name__)

AUDIO_DIR = Path(__file__).resolve().parents[1] / "data" / "audio"
AUDIO_DIR.mkdir(parents=True, exist_ok=True)


def iflytek_spark_available() -> bool:
    """是否已配置星火 LLM 凭据（浏览器 or env 都算）。"""
    return bool(get_credential("XF_SPARK_API_PASSWORD"))


def iflytek_tts_available() -> bool:
    """是否已配置讯飞 TTS 凭据（浏览器 or env 都算）。"""
    return all(
        get_credential(key)
        for key in ("XF_TTS_APPID", "XF_TTS_API_KEY", "XF_TTS_API_SECRET")
    )


class IFlytekTTS:
    """讯飞 WebSocket 在线语音合成调用封装。

    采用「在线语音合成（流式版）」协议：
      wss://tts-api.xfyun.cn/v2/tts
    生成的 PCM 帧拼接成 wav 文件落到 backend/data/audio/，返回相对 URL。
    """

    HOST = "tts-api.xfyun.cn"
    PATH = "/v2/tts"

    def __init__(
        self,
        appid: Optional[str] = None,
        api_key: Optional[str] = None,
        api_secret: Optional[str] = None,
        voice: str = "xiaoyan",
    ) -> None:
        # 优先用户在浏览器配置的，回退环境变量
        self.appid = appid or get_credential("XF_TTS_APPID") or ""
        self.api_key = api_key or get_credential("XF_TTS_API_KEY") or ""
        self.api_secret = api_secret or get_credential("XF_TTS_API_SECRET") or ""
        self.voice = voice

    def is_ready(self) -> bool:
        return bool(self.appid and self.api_key and self.api_secret)

    def _build_url(self) -> str:
        now = formatdate(timeval=time.time(), localtime=False, usegmt=True)
        signature_origin = (
            f"host: {self.HOST}\n"
            f"date: {now}\n"
            f"GET {self.PATH} HTTP/1.1"
        )
        signature_sha = hmac.new(
            self.api_secret.encode("utf-8"),
            signature_origin.encode("utf-8"),
            digestmod=hashlib.sha256,
        ).digest()
        signature_sha_b64 = base64.b64encode(signature_sha).decode("utf-8")
        authorization_origin = (
            f'api_key="{self.api_key}", algorithm="hmac-sha256", '
            f'headers="host date request-line", signature="{signature_sha_b64}"'
        )
        authorization = base64.b64encode(authorization_origin.encode("utf-8")).decode("utf-8")
        params = {"authorization": authorization, "date": now, "host": self.HOST}
        return f"wss://{self.HOST}{self.PATH}?{urlencode(params)}"

    def synthesize(self, text: str, filename_hint: str = "lecture") -> Optional[str]:
        """同步把文本合成为 wav 文件，返回相对 URL；失败返回 None。

        网络/凭据/依赖任何一项不满足都返回 None；外层应做降级。
        """
        if not self.is_ready():
            logger.info("iFlytek TTS credentials missing; skip synthesize.")
            return None

        cleaned = _sanitize_text_for_tts(text)
        if not cleaned:
            return None

        try:
            from websocket import create_connection  # type: ignore
        except ImportError:
            logger.warning("websocket-client not installed; skip iFlytek TTS.")
            return None

        url = self._build_url()
        common = {"app_id": self.appid}
        business = {
            "aue": "lame",  # 直接拿 MP3 输出
            "sfl": 1,
            "auf": "audio/L16;rate=16000",
            "vcn": self.voice,
            "tte": "UTF8",
            "speed": 50,
            "volume": 70,
            "pitch": 50,
        }
        data = {
            "status": 2,
            "text": base64.b64encode(cleaned.encode("utf-8")).decode("utf-8"),
        }

        try:
            ws = create_connection(url, timeout=20)
            ws.send(json.dumps({"common": common, "business": business, "data": data}))
            mp3_chunks: list[bytes] = []
            while True:
                raw = ws.recv()
                if not raw:
                    break
                payload = json.loads(raw)
                code = payload.get("code", -1)
                if code != 0:
                    logger.warning(
                        "iFlytek TTS error: code=%s msg=%s",
                        code,
                        payload.get("message"),
                    )
                    ws.close()
                    return None
                audio_b64 = payload.get("data", {}).get("audio")
                if audio_b64:
                    mp3_chunks.append(base64.b64decode(audio_b64))
                if payload.get("data", {}).get("status") == 2:
                    break
            ws.close()
        except Exception as exc:  # pragma: no cover - 网络/凭据错误
            logger.warning("iFlytek TTS request failed: %s", exc)
            return None

        if not mp3_chunks:
            return None

        safe_hint = re.sub(r"[^a-zA-Z0-9_\-]", "_", filename_hint)[:32] or "lecture"
        ts = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
        fname = f"{safe_hint}_{ts}_{uuid.uuid4().hex[:6]}.mp3"
        out = AUDIO_DIR / fname
        out.write_bytes(b"".join(mp3_chunks))
        logger.info("iFlytek TTS audio saved: %s (%.1f KB)", out.name, out.stat().st_size / 1024)
        return f"/api/audio/{fname}"


def _sanitize_text_for_tts(text: str, limit: int = 2000) -> str:
    """去掉 markdown 标记和过长内容，避免 TTS 配额浪费且朗读自然。"""
    cleaned = re.sub(r"```.*?```", "", text, flags=re.S)
    cleaned = re.sub(r"`[^`]+`", "", cleaned)
    cleaned = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", cleaned)
    cleaned = re.sub(r"\[(.*?)\]\([^)]*\)", r"\1", cleaned)
    cleaned = re.sub(r"^#{1,6}\s*", "", cleaned, flags=re.M)
    cleaned = re.sub(r"[*_>#-]{2,}", " ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    if len(cleaned) > limit:
        cleaned = cleaned[: limit - 1] + "。"
    return cleaned
