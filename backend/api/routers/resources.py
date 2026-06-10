from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Query

from services.exam.store import ExamStore
from services.quiz.quiz_store import QuizStore
from services.resource_package.store import ResourcePackageStore

router = APIRouter(prefix="/api/v1/resources", tags=["resources"])

package_store = ResourcePackageStore()
quiz_store = QuizStore()
exam_store = ExamStore()


@router.get("")
async def list_resource_packages(
    limit: int = Query(default=50, ge=1, le=200),
    session_id: str | None = None,
) -> list[dict[str, Any]]:
    return await package_store.list_packages(limit=limit, session_id=session_id)


@router.get("/session/{session_id}/latest")
async def get_latest_resource_package(session_id: str) -> dict[str, Any] | None:
    return await package_store.get_latest_package(session_id)


@router.post("/session/{session_id}/from-latest")
async def create_resource_package_from_latest(session_id: str) -> dict[str, Any]:
    quiz = await quiz_store.get_latest_quiz(session_id)
    exam = await exam_store.get_latest_exam(session_id)
    if not quiz and not exam:
        raise HTTPException(status_code=404, detail="当前会话暂无可沉淀的学习资源")

    package = await package_store.create_from_generation(
        session_id=session_id,
        source_prompt="从当前会话最近一次学习资源生成结果沉淀资源包",
        quiz=quiz,
        exam=exam,
    )
    return package


@router.get("/{package_id}")
async def get_resource_package(package_id: str) -> dict[str, Any]:
    package = await package_store.get_package(package_id)
    if not package:
        raise HTTPException(status_code=404, detail="资源包不存在")
    return package
