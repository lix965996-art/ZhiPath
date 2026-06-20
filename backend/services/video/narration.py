"""旁白合成：讯飞 TTS 为主链路（赛题硬性要求），Windows 离线 SAPI 兜底，最后静音。

返回 (本地音频文件绝对路径, provider 名)；都不可用时返回 (None, "silent")。
"""
from __future__ import annotations

import logging
import os
import subprocess
import sys
import tempfile
import uuid
from pathlib import Path

logger = logging.getLogger(__name__)


def provider_marker() -> str:
    """当前可用的旁白来源标记，用于渲染缓存键（影响是否有声）。"""
    try:
        from base.iflytek_factory import iflytek_tts_available

        if iflytek_tts_available():
            return "xf"
    except Exception:
        pass
    if sys.platform == "win32":
        return "sapi"
    return "silent"


def synthesize(text: str, hint: str = "video") -> tuple[str | None, str]:
    """把旁白文本合成为本地音频文件。"""
    if not text or not text.strip():
        return None, "silent"

    # 1) 讯飞 TTS（主）
    try:
        from base.iflytek_factory import AUDIO_DIR, IFlytekTTS, iflytek_tts_available

        if iflytek_tts_available():
            url = IFlytekTTS().synthesize(text, filename_hint=hint)
            if url:
                local = Path(AUDIO_DIR) / os.path.basename(url)
                if local.exists():
                    return str(local), "iFlytek"
    except Exception as exc:  # noqa: BLE001
        logger.warning("讯飞 TTS 旁白失败，尝试离线兜底：%s", exc)

    # 2) Windows 离线 SAPI（兜底，仅本机演示）
    if sys.platform == "win32":
        wav = _sapi_synthesize(text)
        if wav:
            return wav, "WindowsSAPI"

    # 3) 静音
    return None, "silent"


def _sapi_synthesize(text: str) -> str | None:
    out = Path(tempfile.gettempdir()) / f"zhipath_narr_{uuid.uuid4().hex[:8]}.wav"
    safe = text.replace("'", "’")
    ps = (
        "Add-Type -AssemblyName System.Speech; "
        "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer; "
        "try { $s.SelectVoice('Microsoft Huihui Desktop') } catch {}; "
        "$s.Rate = 0; "
        f"$s.SetOutputToWaveFile('{out}'); "
        f"$s.Speak('{safe}'); $s.Dispose()"
    )
    try:
        subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command", ps],
            check=True, capture_output=True, timeout=60,
        )
        if out.exists() and out.stat().st_size > 1024:
            return str(out)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Windows SAPI 旁白失败：%s", exc)
    return None
