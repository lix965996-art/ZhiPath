"""教师/班级聚合视图：
- 把所有 session 视为「学生」，聚合 BKT 掌握度、薄弱点、FSRS 复习量
- 给出班级 TOP 薄弱 KC、TOP 待复习学生、平均掌握度热力等

不是一个真的「多租户」实现（不引入用户体系），而是在现有 session 数据上做聚合，
体现"教师场景已经考虑"。
"""
from __future__ import annotations

import csv
import io
import json
import logging
from collections import defaultdict
from typing import Any

logger = logging.getLogger(__name__)

from fastapi import APIRouter
from fastapi.responses import PlainTextResponse, Response

from services.mastery import MasteryStore
from services.profile import LearningProfileService
from services.session.store import SessionStore
from services.srs import ReviewStore

router = APIRouter(prefix="/api/v1/classroom", tags=["classroom"])
session_store = SessionStore()
profile_service = LearningProfileService()
mastery_store = MasteryStore()
review_store = ReviewStore()


@router.get("/overview")
async def classroom_overview(limit: int = 30):
    """班级总览：每个学生的关键指标 + 班级聚合。"""
    sessions = await session_store.list_sessions(limit=limit)
    students: list[dict[str, Any]] = []
    kc_weak_counter: dict[str, int] = defaultdict(int)
    avg_masteries: list[float] = []
    review_due_total = 0

    for s in sessions:
        sid = s["id"]
        try:
            profile = await profile_service.get_profile(sid)
            mastery_snapshot = await mastery_store.get_mastery(sid)
            calendar = await review_store.get_calendar(sid, days=7)
            avg_mastery = mastery_snapshot.get("summary", {}).get("avg_mastery", 0)
            avg_masteries.append(avg_mastery)
            due_count = (
                calendar.get("stats", {}).get("review", 0) + calendar.get("stats", {}).get("relearning", 0)
            )
            review_due_total += due_count
            weak_top: list[str] = []
            for kc in mastery_snapshot.get("kcs", [])[:5]:
                kc_weak_counter[kc["label"]] += 1 if kc["mastery"] < 0.5 else 0
                weak_top.append(kc["label"])

            students.append({
                "session_id": sid,
                "title": s.get("title", "")[:24] or sid[:8],
                "turn_count": profile.get("turn_count", 0),
                "learning_goal": profile.get("learning_goal", "") or "—",
                "avg_mastery": avg_mastery,
                "weak_count": mastery_snapshot.get("summary", {}).get("weak", 0),
                "mature_count": mastery_snapshot.get("summary", {}).get("mature", 0),
                "due_count": due_count,
                "weak_top": weak_top,
            })
        except Exception as exc:
            logger.warning("Skipping session %s in classroom overview: %s", sid, exc)
            continue

    students.sort(key=lambda x: x["avg_mastery"])

    top_weak_kcs = sorted(
        [{"label": k, "count": v} for k, v in kc_weak_counter.items() if v > 0],
        key=lambda x: -x["count"],
    )[:10]

    return {
        "student_count": len(students),
        "students": students,
        "aggregate": {
            "avg_mastery": (sum(avg_masteries) / len(avg_masteries)) if avg_masteries else 0,
            "review_due_total": review_due_total,
            "top_weak_kcs": top_weak_kcs,
        },
    }


@router.get("/leaderboard")
async def classroom_leaderboard(limit: int = 30, sort_by: str = "mastery"):
    """学习榜单：按掌握度 / 做题数 / 复习量排序，老师快速识别"亮眼/掉队"学生。"""
    data = await classroom_overview(limit=limit)
    students = data["students"]
    if sort_by == "due":
        students = sorted(students, key=lambda s: -s["due_count"])
    elif sort_by == "turns":
        students = sorted(students, key=lambda s: -s["turn_count"])
    else:
        students = sorted(students, key=lambda s: -s["avg_mastery"])
    return {"students": students[:limit], "sort_by": sort_by}


@router.get("/export.csv")
async def export_classroom_csv(limit: int = 200) -> Response:
    """CSV 导出：可直接用 Excel/WPS/Numbers 打开。"""
    data = await classroom_overview(limit=limit)
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "session_id", "title", "learning_goal",
        "turn_count", "avg_mastery", "weak_count", "mature_count",
        "due_count", "weak_top",
    ])
    for s in data["students"]:
        writer.writerow([
            s.get("session_id", ""),
            s.get("title", ""),
            s.get("learning_goal", ""),
            s.get("turn_count", 0),
            round(s.get("avg_mastery", 0), 3),
            s.get("weak_count", 0),
            s.get("mature_count", 0),
            s.get("due_count", 0),
            "; ".join(s.get("weak_top", [])),
        ])
    # 加 BOM 让 Excel 默认按 UTF-8 打开（解决中文乱码）
    content = "﻿" + buf.getvalue()
    return Response(
        content=content,
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": 'attachment; filename="zhipath-classroom.csv"',
        },
    )


@router.get("/export.json")
async def export_classroom_json(limit: int = 200) -> Response:
    """JSON 全量导出：含 aggregate + students 数组。"""
    data = await classroom_overview(limit=limit)
    return Response(
        content=json.dumps(data, ensure_ascii=False, indent=2),
        media_type="application/json; charset=utf-8",
        headers={
            "Content-Disposition": 'attachment; filename="zhipath-classroom.json"',
        },
    )
