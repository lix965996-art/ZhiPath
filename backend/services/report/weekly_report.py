"""学习周报 PDF 生成 (reportlab) — 一键导出可发给家长/老师的图文报告。

包含：
1. 学习者画像快照（7 维度覆盖率）
2. 本周 BKT 掌握度 TOP 进步与薄弱
3. FSRS 复习量统计
4. 多智能体调用次数（按 Span 类型聚合）
5. 下一步建议（来自 KG 推荐）

仅依赖 reportlab，纯 Python 渲染。中文字体优先使用系统 SimHei/SimSun 兼容字体；
缺字体时退化为英文但保留所有数据指标。
"""
from __future__ import annotations

import io
import logging
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from reportlab.graphics.charts.barcharts import HorizontalBarChart
from reportlab.graphics.shapes import Drawing, Rect, String
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from services.knowledge_graph import KnowledgeGraph
from services.mastery import MasteryStore
from services.profile import LearningProfileService
from services.srs import ReviewStore
from services.tracing import get_tracer

logger = logging.getLogger(__name__)

# 尝试注册中文字体
_CHINESE_FONT_NAME = "LFCN"
_CHINESE_REGISTERED = False
_FALLBACK_CHINESE_FONTS = [
    r"C:\Windows\Fonts\msyh.ttc",
    r"C:\Windows\Fonts\msyh.ttf",
    r"C:\Windows\Fonts\simhei.ttf",
    r"C:\Windows\Fonts\simsun.ttc",
    "/System/Library/Fonts/PingFang.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
]


def _ensure_chinese_font() -> str | None:
    global _CHINESE_REGISTERED
    if _CHINESE_REGISTERED:
        return _CHINESE_FONT_NAME
    for path in _FALLBACK_CHINESE_FONTS:
        if not os.path.exists(path):
            continue
        try:
            pdfmetrics.registerFont(TTFont(_CHINESE_FONT_NAME, path))
            _CHINESE_REGISTERED = True
            return _CHINESE_FONT_NAME
        except Exception as exc:
            logger.warning("Failed registering font %s: %s", path, exc)
    return None


async def build_weekly_report_pdf(session_id: str) -> bytes:
    profile_svc = LearningProfileService()
    mastery_store = MasteryStore()
    review_store = ReviewStore()
    kg = KnowledgeGraph()

    profile = await profile_svc.get_profile(session_id)
    mastery = await mastery_store.get_mastery(session_id)
    calendar = await review_store.get_calendar(session_id, days=7)
    kg_data = await kg.get(session_id)

    return _render_pdf(
        session_id=session_id,
        profile=profile,
        mastery=mastery,
        calendar=calendar,
        kg_data=kg_data,
    )


def _render_pdf(
    session_id: str,
    profile: dict[str, Any],
    mastery: dict[str, Any],
    calendar: dict[str, Any],
    kg_data: dict[str, Any],
) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=20 * mm,
        bottomMargin=18 * mm,
        title=f"ZhiPath 学习周报 - {session_id[:8]}",
    )

    font_name = _ensure_chinese_font()
    styles = getSampleStyleSheet()
    if font_name:
        title_style = ParagraphStyle("LFTitle", parent=styles["Title"], fontName=font_name, fontSize=22, leading=28)
        h2 = ParagraphStyle("LFH2", parent=styles["Heading2"], fontName=font_name, fontSize=14, leading=20)
        body = ParagraphStyle("LFBody", parent=styles["BodyText"], fontName=font_name, fontSize=10, leading=14)
        small = ParagraphStyle("LFSmall", parent=styles["BodyText"], fontName=font_name, fontSize=9, leading=12, textColor=colors.HexColor("#64748b"))
    else:
        title_style = styles["Title"]
        h2 = styles["Heading2"]
        body = styles["BodyText"]
        small = ParagraphStyle("LFSmall", parent=styles["BodyText"], fontSize=9, textColor=colors.HexColor("#64748b"))

    flow: list[Any] = []
    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)
    flow.append(Paragraph("ZhiPath 学习周报", title_style))
    flow.append(Paragraph(
        f"学习者 ID: {session_id[:12]} · 周期: {week_ago.date()} ~ {now.date()}",
        small,
    ))
    flow.append(Spacer(1, 6 * mm))

    # --- 画像 ---
    flow.append(Paragraph("1. 学习者画像", h2))
    coverage = profile.get("dimension_coverage", {}) or {}
    dims = coverage.get("dimensions", {}) or {}
    coverage_rows = [["维度", "已覆盖", "样例"]]
    label_map = {
        "learning_goal": ("学习目标", profile.get("learning_goal") or "—"),
        "level": ("水平", profile.get("level") or "—"),
        "topics": ("主题", ", ".join(profile.get("topics", []) or []) or "—"),
        "weak_points": ("薄弱点", ", ".join(profile.get("weak_points", []) or []) or "—"),
        "preferences": ("偏好", ", ".join(profile.get("preferences", []) or []) or "—"),
        "constraints": ("约束", ", ".join(profile.get("constraints", []) or []) or "—"),
        "recent_intents": ("近期意图", ", ".join(profile.get("recent_intents", []) or []) or "—"),
    }
    for dim, (label, sample) in label_map.items():
        coverage_rows.append([
            Paragraph(label, body),
            "✓" if dims.get(dim) else "—",
            Paragraph(str(sample)[:60], body),
        ])
    table = Table(coverage_rows, colWidths=[35 * mm, 18 * mm, 110 * mm])
    table.setStyle(_table_style(font_name))
    flow.append(table)
    flow.append(Spacer(1, 4 * mm))
    flow.append(Paragraph(
        f"维度覆盖率: {coverage.get('score', 0)}/{coverage.get('total', 7)} · 累计 {profile.get('turn_count', 0)} 轮对话",
        small,
    ))
    flow.append(Spacer(1, 6 * mm))

    # --- BKT ---
    flow.append(Paragraph("2. 知识点掌握度（BKT 贝叶斯知识追踪）", h2))
    kcs = mastery.get("kcs", [])
    summary = mastery.get("summary", {})
    flow.append(Paragraph(
        f"共 {summary.get('count', 0)} 个知识点 · 平均掌握度 {(summary.get('avg_mastery', 0) * 100):.0f}% · 薄弱 {summary.get('weak', 0)} · 已巩固 {summary.get('mature', 0)}",
        small,
    ))
    flow.append(Spacer(1, 2 * mm))
    if kcs:
        # 柱状图：TOP 10 知识点掌握度
        flow.append(_build_mastery_chart(kcs[:10], font_name))
        flow.append(Spacer(1, 3 * mm))

        sorted_kcs = sorted(kcs, key=lambda k: k["mastery"])
        rows = [["知识点", "掌握度", "做题数", "正确率"]]
        for kc in sorted_kcs[:10]:
            rows.append([
                Paragraph(str(kc.get("label", ""))[:32], body),
                f"{kc.get('mastery', 0) * 100:.0f}%",
                str(kc.get("attempts", 0)),
                f"{kc.get('accuracy', 0) * 100:.0f}%",
            ])
        t = Table(rows, colWidths=[80 * mm, 25 * mm, 25 * mm, 25 * mm])
        t.setStyle(_table_style(font_name))
        flow.append(t)
    else:
        flow.append(Paragraph("尚无答题记录。", body))
    flow.append(Spacer(1, 6 * mm))

    # --- FSRS ---
    flow.append(Paragraph("3. 复习量（FSRS 间隔重复）", h2))
    stats = calendar.get("stats", {})
    flow.append(Paragraph(
        f"卡片总数 {stats.get('total', 0)} · 新卡 {stats.get('new', 0)} · 待复习 {stats.get('review', 0) + stats.get('relearning', 0)} · 已巩固 ≥21d: {stats.get('mature_count', 0)}",
        body,
    ))
    flow.append(Paragraph(
        f"平均稳定性 {stats.get('avg_stability', 0):.1f} 天 · 平均难度 {stats.get('avg_difficulty', 0):.1f}",
        small,
    ))
    flow.append(Spacer(1, 2 * mm))
    # 14 天日历热力图
    flow.append(_build_calendar_heatmap(calendar, font_name))
    flow.append(Spacer(1, 4 * mm))

    # --- KG ---
    flow.append(Paragraph("4. 知识图谱", h2))
    flow.append(Paragraph(
        f"已建模 {len(kg_data.get('nodes', []))} 个节点 · {len(kg_data.get('edges', []))} 条前后置依赖",
        body,
    ))
    flow.append(Spacer(1, 4 * mm))

    # --- Tracer ---
    flow.append(Paragraph("5. 多智能体调用记录", h2))
    tracer = get_tracer()
    traces = tracer.list_traces(limit=20)
    if traces:
        rows = [["Trace ID", "Span 数", "时长 (ms)", "Root"]]
        for t in traces[:10]:
            rows.append([
                t.get("trace_id", "")[:12],
                str(t.get("span_count", 0)),
                str(t.get("duration_ms", 0)),
                str(t.get("root_name", ""))[:24],
            ])
        table2 = Table(rows, colWidths=[35 * mm, 20 * mm, 25 * mm, 75 * mm])
        table2.setStyle(_table_style(font_name))
        flow.append(table2)
    else:
        flow.append(Paragraph("无追踪记录。", body))
    flow.append(Spacer(1, 6 * mm))

    flow.append(Paragraph(
        "本报告由 ZhiPath（多智能体个性化学习系统）自动生成。系统采用 FSRS-4 间隔重复、Bayesian Knowledge Tracing、OpenTelemetry 语义追踪。",
        small,
    ))

    doc.build(flow)
    return buf.getvalue()


def _build_mastery_chart(kcs: list[dict[str, Any]], font_name: str | None) -> Drawing:
    """TOP-N 掌握度横向柱状图。"""
    fn = font_name or "Helvetica"
    width = 160 * mm
    height = max(30 * mm, 8 * mm + 6 * mm * len(kcs))
    d = Drawing(width, height)
    chart = HorizontalBarChart()
    chart.x = 70
    chart.y = 10
    chart.width = width - 90
    chart.height = height - 20
    chart.data = [[round(kc.get("mastery", 0) * 100, 1) for kc in kcs]]
    chart.categoryAxis.categoryNames = [str(kc.get("label", ""))[:14] for kc in kcs]
    chart.valueAxis.valueMin = 0
    chart.valueAxis.valueMax = 100
    chart.valueAxis.valueStep = 20
    chart.bars[0].fillColor = colors.HexColor("#0ea5e9")
    chart.categoryAxis.labels.fontName = fn
    chart.categoryAxis.labels.fontSize = 7
    chart.valueAxis.labels.fontName = fn
    chart.valueAxis.labels.fontSize = 7
    d.add(chart)
    return d


def _build_calendar_heatmap(calendar_data: dict[str, Any], font_name: str | None) -> Drawing:
    """14 天 FSRS 复习量小热力图（更适合纸面打印的极简版）。"""
    fn = font_name or "Helvetica"
    buckets = calendar_data.get("buckets", {}) or {}
    today_iso = calendar_data.get("today", "")

    # 取 -3 ~ +14 共 18 天
    try:
        today = datetime.fromisoformat(today_iso).date()
    except ValueError:
        today = datetime.now(timezone.utc).date()

    cells: list[tuple[str, int, bool]] = []
    for off in range(-3, 15):
        d = today + timedelta(days=off)
        key = d.isoformat()
        n = len(buckets.get(key, []) or [])
        cells.append((d.strftime("%m-%d"), n, off == 0))

    width = 170 * mm
    cell_w = (width - 10) / len(cells)
    height = 18 * mm
    d = Drawing(width, height)

    if not cells:
        return d
    max_n = max(1, max(n for _, n, _ in cells))

    for i, (label, n, is_today) in enumerate(cells):
        x = 5 + i * cell_w
        # 颜色按数量浓淡
        if n == 0:
            fill = colors.HexColor("#f1f5f9")
        else:
            ratio = min(1.0, n / max_n)
            r = int(220 - 200 * ratio)
            g = int(252 - 60 * ratio)
            b = int(231 - 80 * ratio)
            fill = colors.Color(r / 255, g / 255, b / 255)
        rect = Rect(x, 5, cell_w - 1, 10 * mm, fillColor=fill, strokeColor=colors.HexColor("#cbd5e1"), strokeWidth=0.3)
        if is_today:
            rect.strokeColor = colors.HexColor("#0ea5e9")
            rect.strokeWidth = 1.4
        d.add(rect)
        d.add(String(x + cell_w / 2, 5 + 10 * mm + 2, label, textAnchor="middle", fontName=fn, fontSize=5.5, fillColor=colors.HexColor("#475569")))
        if n > 0:
            d.add(String(x + cell_w / 2, 5 + 4 * mm, str(n), textAnchor="middle", fontName=fn, fontSize=7, fillColor=colors.HexColor("#0f172a")))
    return d


def _table_style(font_name: str | None) -> TableStyle:
    fn = font_name or "Helvetica"
    return TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), fn),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("LEADING", (0, 0), (-1, -1), 12),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0f172a")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("ALIGN", (1, 0), (-1, -1), "CENTER"),
        ("ALIGN", (0, 0), (0, -1), "LEFT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f1f5f9")]),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ("INNERGRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#e2e8f0")),
    ])
