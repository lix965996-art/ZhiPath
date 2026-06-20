"""视频文件下发路由：提供 Manim + 讯飞 TTS 合成的动画讲解视频。"""
from __future__ import annotations

import re
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

VIDEO_DIR = Path(__file__).resolve().parents[2] / "data" / "video"

router = APIRouter(tags=["video"])


@router.get("/api/video/{filename}")
async def get_video(filename: str) -> FileResponse:
    # 防穿越：只允许字母/数字/下划线/连字符 + mp4 后缀
    if not re.fullmatch(r"[A-Za-z0-9_\-]+\.mp4", filename):
        raise HTTPException(status_code=400, detail="invalid filename")
    path = VIDEO_DIR / filename
    if not path.exists():
        raise HTTPException(status_code=404, detail="video not found")
    return FileResponse(path, media_type="video/mp4", filename=filename)
