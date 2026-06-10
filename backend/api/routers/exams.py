from __future__ import annotations

from html import escape
from typing import Any
from urllib.parse import quote

from fastapi import APIRouter, HTTPException, Response
from fastapi.responses import HTMLResponse

from services.exam.docx_export import build_exam_docx
from services.exam.store import ExamStore
from services.quiz.quiz_store import QuizStore

router = APIRouter(prefix="/api/v1/exams", tags=["exams"])
exam_store = ExamStore()
quiz_store = QuizStore()


@router.get("/session/{session_id}/latest")
async def get_latest_exam(session_id: str) -> dict[str, Any] | None:
    return await exam_store.get_latest_exam(session_id)


@router.post("/session/{session_id}/from-latest-quiz")
async def create_exam_from_latest_quiz(session_id: str) -> dict[str, Any]:
    quiz = await quiz_store.get_latest_quiz(session_id)
    if not quiz:
        raise HTTPException(status_code=404, detail="未找到可转换为试卷的测验")
    exam = await exam_store.create_from_quiz(session_id=session_id, quiz_data=quiz)
    if not exam:
        raise HTTPException(status_code=400, detail="测验中没有可用题目")
    return exam


@router.get("/{exam_id}")
async def get_exam(exam_id: str) -> dict[str, Any]:
    exam = await exam_store.get_exam(exam_id)
    if not exam:
        raise HTTPException(status_code=404, detail="试卷不存在")
    return exam


@router.get("/{exam_id}/docx")
async def download_exam_docx(exam_id: str, include_answers: bool = True) -> Response:
    exam = await exam_store.get_exam(exam_id)
    if not exam:
        raise HTTPException(status_code=404, detail="试卷不存在")

    content = build_exam_docx(exam, include_answers=include_answers)
    filename = quote(_safe_filename(str(exam.get("title") or exam_id)))
    return Response(
        content,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{filename}.docx",
        },
    )


@router.get("/{exam_id}/print", response_class=HTMLResponse)
async def print_exam(exam_id: str, include_answers: bool = True) -> str:
    exam = await exam_store.get_exam(exam_id)
    if not exam:
        raise HTTPException(status_code=404, detail="试卷不存在")
    return _build_print_html(exam, include_answers=include_answers)


def _safe_filename(filename: str) -> str:
    return "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in filename)[:80] or "exam"


def _build_print_html(exam: dict[str, Any], include_answers: bool) -> str:
    questions = exam.get("questions", []) or []
    grouped = {
        "single_choice": ("一、选择题", [q for q in questions if q.get("type") == "single_choice"]),
        "multiple_choice": ("二、多选题", [q for q in questions if q.get("type") == "multiple_choice"]),
        "true_false": ("三、判断题", [q for q in questions if q.get("type") == "true_false"]),
        "short_answer": ("四、简答题", [q for q in questions if q.get("type") == "short_answer"]),
    }

    question_index = 1
    sections: list[str] = []
    for _, (title, items) in grouped.items():
        if not items:
            continue
        body: list[str] = [f"<h2>{escape(title)}</h2>"]
        for question in items:
            body.append(_question_html(question, question_index))
            question_index += 1
        sections.append("\n".join(body))

    answers_html = ""
    if include_answers:
        answer_items = []
        for index, question in enumerate(questions, start=1):
            answer_items.append(
                "<div class='answer'>"
                f"<strong>{index}. 答案：</strong>{escape(_format_answer(question))}"
                f"<p>{escape(str(question.get('explanation') or ''))}</p>"
                "</div>"
            )
        answers_html = "<section class='answers'><h2>答案与解析</h2>" + "\n".join(answer_items) + "</section>"

    return f"""<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{escape(str(exam.get("title", "个性化测试卷")))}</title>
  <style>
    body {{ margin: 0; background: #f5f5f7; color: #000; font-family: "SimSun", "宋体", serif; }}
    .page {{ width: 210mm; min-height: 297mm; margin: 20px auto; background: white; padding: 20mm; box-shadow: 0 12px 40px rgba(0,0,0,.08); }}
    h1 {{ text-align: center; font-size: 24px; margin: 0 0 14px; color: #000; font-weight: 700; }}
    h2 {{ font-size: 18px; margin: 24px 0 12px; color: #000; font-weight: 700; }}
    .meta, .student {{ display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; text-align: center; font-size: 14px; color: #000; margin: 8px 0; }}
    .student {{ grid-template-columns: repeat(3, 1fr); margin: 18px 0 26px; }}
    .question {{ margin: 14px 0 18px; font-size: 15px; line-height: 1.8; }}
    .options {{ display: grid; grid-template-columns: 1fr 1fr; gap: 4px 18px; margin: 8px 0 0 22px; }}
    .blank {{ border-bottom: 1px solid #999; height: 28px; margin: 8px 0; }}
    .answers {{ page-break-before: always; }}
    .answer {{ font-size: 14px; line-height: 1.8; margin: 10px 0; color: #000; }}
    .answer p {{ margin: 4px 0 0; color: #000; }}
    .toolbar {{ position: sticky; top: 0; display: flex; justify-content: center; gap: 8px; padding: 10px; background: rgba(245,245,247,.85); backdrop-filter: blur(12px); }}
    .toolbar button {{ border: 0; border-radius: 999px; padding: 8px 14px; background: #007aff; color: white; cursor: pointer; }}
    @media print {{
      body {{ background: white; }}
      .toolbar {{ display: none; }}
      .page {{ margin: 0; box-shadow: none; width: auto; min-height: auto; }}
    }}
  </style>
</head>
<body>
  <div class="toolbar"><button onclick="window.print()">打印 / 保存 PDF</button></div>
  <main class="page">
    <h1>{escape(str(exam.get("title", "个性化测试卷")))}</h1>
    <div class="meta">
      <span>科目：{escape(str(exam.get("subject", "综合学习")))}</span>
      <span>主题：{escape(str(exam.get("topic", "个性化学习")))}</span>
      <span>时间：{exam.get("duration_minutes", 45)} 分钟</span>
      <span>满分：{exam.get("total_score", 100)} 分</span>
    </div>
    <div class="student">
      <span>姓名：____________</span>
      <span>班级：____________</span>
      <span>日期：____________</span>
    </div>
    {"".join(sections)}
    {answers_html}
  </main>
</body>
</html>"""


def _question_html(question: dict[str, Any], index: int) -> str:
    options = question.get("options", []) or []
    options_html = "".join(
        f"<div>{chr(65 + option_index)}. {escape(str(option))}</div>"
        for option_index, option in enumerate(options)
    )
    blanks = ""
    if question.get("type") == "short_answer":
        blanks = "<div class='blank'></div><div class='blank'></div><div class='blank'></div>"
    return (
        "<div class='question'>"
        f"<strong>{index}. </strong>{escape(str(question.get('question', '')))}"
        f"（{question.get('score', 0)} 分）"
        f"<div class='options'>{options_html}</div>"
        f"{blanks}"
        "</div>"
    )


def _format_answer(question: dict[str, Any]) -> str:
    answer = question.get("answer", "")
    if question.get("type") == "true_false":
        return "正确" if answer is True else "错误"
    if question.get("type") in {"single_choice", "multiple_choice"}:
        return _format_choice_answer(answer)
    if isinstance(answer, list):
        return "、".join(str(item) for item in answer)
    return str(answer)


def _format_choice_answer(answer: Any) -> str:
    if isinstance(answer, list):
        return "、".join(_choice_label(item) for item in answer)
    return _choice_label(answer)


def _choice_label(value: Any) -> str:
    if isinstance(value, int):
        return chr(65 + value) if 0 <= value < 26 else str(value)
    text = str(value).strip()
    if text.isdigit():
        index = int(text)
        return chr(65 + index) if 0 <= index < 26 else text
    return text
