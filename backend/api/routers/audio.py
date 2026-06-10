"""音频文件下发路由：提供讯飞 TTS 生成的讲义音频文件。"""
from __future__ import annotations

import re
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

AUDIO_DIR = Path(__file__).resolve().parents[2] / "data" / "audio"

router = APIRouter(tags=["audio"])


@router.get("/api/audio/{filename}")
async def get_audio(filename: str) -> FileResponse:
    # 防穿越：只允许字母/数字/下划线/连字符 + 已知音频后缀
    if not re.fullmatch(r"[A-Za-z0-9_\-]+\.(mp3|wav)", filename):
        raise HTTPException(status_code=400, detail="invalid filename")
    path = AUDIO_DIR / filename
    if not path.exists():
        raise HTTPException(status_code=404, detail="audio not found")
    media = "audio/mpeg" if filename.endswith(".mp3") else "audio/wav"
    return FileResponse(path, media_type=media, filename=filename)
