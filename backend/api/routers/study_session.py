"""学习时长 / 番茄钟事件接收。前端番茄钟结束后 POST 一次，记录到画像。"""
from __future__ import annotations

import asyncio
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/api/v1/study", tags=["study-session"])

DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "study_sessions"
DATA_DIR.mkdir(parents=True, exist_ok=True)


class PomodoroRecord(BaseModel):
    session_id: str
    duration_seconds: int  # 实际学习时长
    type: str = "focus"    # focus / short_break / long_break
    topic: str = ""
    completed: bool = True


def _safe(name: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_-]", "", name) or "default"


@router.post("/pomodoro")
async def log_pomodoro(rec: PomodoroRecord):
    path = DATA_DIR / f"{_safe(rec.session_id)}.jsonl"
    payload = {
        "session_id": rec.session_id,
        "duration_seconds": rec.duration_seconds,
        "type": rec.type,
        "topic": rec.topic,
        "completed": rec.completed,
        "ts": datetime.now(timezone.utc).isoformat(),
    }
    def _write():
        with path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(payload, ensure_ascii=False) + "\n")

    await asyncio.to_thread(_write)
    return {"status": "ok"}


@router.get("/{session_id}/stats")
async def get_stats(session_id: str) -> dict[str, Any]:
    path = DATA_DIR / f"{_safe(session_id)}.jsonl"
    if not path.exists():
        return {
            "total_minutes": 0,
            "focus_sessions": 0,
            "break_minutes": 0,
            "by_day": {},
            "by_topic": {},
        }
    def _read():
        by_day_local: dict[str, float] = {}
        by_topic_local: dict[str, float] = {}
        total_focus_local = 0.0
        total_break_local = 0.0
        focus_sessions_local = 0
        with path.open(encoding="utf-8") as f:
            for line in f:
                try:
                    r = json.loads(line)
                except json.JSONDecodeError:
                    continue
                mins = r.get("duration_seconds", 0) / 60
                day_key = r.get("ts", "")[:10]
                if r.get("type") == "focus":
                    total_focus_local += mins
                    focus_sessions_local += 1 if r.get("completed") else 0
                    by_day_local[day_key] = by_day_local.get(day_key, 0) + mins
                    topic = r.get("topic") or "未指定"
                    by_topic_local[topic] = by_topic_local.get(topic, 0) + mins
                else:
                    total_break_local += mins
        return total_focus_local, focus_sessions_local, total_break_local, by_day_local, by_topic_local

    total_focus, focus_sessions, total_break, by_day, by_topic = await asyncio.to_thread(_read)
    return {
        "total_minutes": round(total_focus, 1),
        "focus_sessions": focus_sessions,
        "break_minutes": round(total_break, 1),
        "by_day": {k: round(v, 1) for k, v in by_day.items()},
        "by_topic": {k: round(v, 1) for k, v in by_topic.items()},
    }
