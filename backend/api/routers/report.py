"""PDF 学习周报下发路由。"""
from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import Response

from services.report import build_weekly_report_pdf

router = APIRouter(prefix="/api/v1/report", tags=["report"])


@router.get("/{session_id}/weekly.pdf")
async def get_weekly_pdf(session_id: str) -> Response:
    data = await build_weekly_report_pdf(session_id)
    return Response(
        content=data,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="zhipath-weekly-{session_id[:8]}.pdf"',
        },
    )
