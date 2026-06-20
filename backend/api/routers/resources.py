from __future__ import annotations

import asyncio
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from services.code_lab.runner import run_c_code
from services.code_lab.tutor import coach_code_lab
from services.code_lab.verify import compare_outputs
from services.exam.store import ExamStore
from services.quiz.quiz_store import QuizStore
from services.resource_package.store import ResourcePackageStore

router = APIRouter(prefix="/api/v1/resources", tags=["resources"])

package_store = ResourcePackageStore()
quiz_store = QuizStore()
exam_store = ExamStore()


class CodeLabRunRequest(BaseModel):
    code: str = Field(min_length=1, description="学生提交的 C 源码")
    stdin: str = Field("", description="喂给程序 stdin 的内容，多数 408 题为空")
    expected_output: str = Field("", description="正确补全后的期望输出；非空时后端做逻辑比对")


class CodeLabCoachRequest(BaseModel):
    code: str = Field(min_length=1, description="学生提交且未通过的 C 源码")
    description: str = Field("", description="任务说明")
    expected_output: str = Field("", description="期望输出")
    reason: str = Field("wrong_output", description="失败类型：compile_error/runtime_error/timeout/wrong_output")
    stderr: str = Field("", description="编译/运行错误信息")
    diff: list[str] = Field(default_factory=list, description="期望 vs 实际 的逐行差异")


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


@router.post("/code-lab/run")
async def run_code_lab(req: CodeLabRunRequest) -> dict[str, Any]:
    """编译并运行学生提交的 C 代码，返回实际输出；若给了 expected_output 则做逻辑比对。

    真正的「逻辑判定」= 学生程序的实际 stdout 与期望输出一致。
    没有 C 编译器时返回 reason="no_compiler"，前端降级为仅结构检查。
    """
    result = await asyncio.to_thread(run_c_code, req.code, req.stdin)
    payload = result.to_dict()
    if req.expected_output and result.ran:
        cmp = compare_outputs(req.expected_output, result.stdout)
        payload["matched_expected"] = cmp.passed
        payload["diff"] = cmp.diff
    else:
        payload["matched_expected"] = False
        payload["diff"] = []
    return payload


@router.post("/code-lab/coach")
async def coach_code_lab_endpoint(req: CodeLabCoachRequest) -> dict[str, Any]:
    """学生代码没通过时，主动求一次「导师点拨」：一条诊断 + 一条提示（不直接给答案）。

    LLM 不可用 / 异常时返回 {"coach": null}，前端据此降级为不展示点拨块。
    """
    coach = await coach_code_lab(
        description=req.description,
        expected_output=req.expected_output,
        code=req.code,
        reason=req.reason,
        stderr=req.stderr,
        diff=req.diff,
    )
    return {"coach": coach.to_dict() if coach else None}
