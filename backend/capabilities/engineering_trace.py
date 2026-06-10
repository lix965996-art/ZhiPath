from __future__ import annotations

from core.context import UnifiedContext
from core.stream_bus import StreamBus


def emit_engineering_trace(
    stream: StreamBus,
    context: UnifiedContext,
    capability_name: str,
) -> None:
    """Emit a concise, user-facing diagnosis trace.

    This is a product explanation layer, not hidden model reasoning. It shows
    what inputs were used, how the learning task is routed, and what quality
    criteria will be applied to the answer.
    """

    profile = context.learner_profile if isinstance(context.learner_profile, dict) else {}
    topics = profile.get("topics") or []
    weak_points = profile.get("weak_points") or []
    preferences = profile.get("preferences") or []
    constraints = profile.get("constraints") or []
    level = profile.get("level") or "待确认"
    goal = context.learning_goal or "待明确"
    has_knowledge = bool(context.knowledge_context)

    module_labels = {
        "chat": "导学讲解",
        "goal": "目标诊断",
        "learning": "路径规划",
        "resource_gen": "资源构建",
    }

    evidence = (
        "已匹配知识库材料，并结合学习画像组织回答"
        if has_knowledge
        else "本轮主要依据用户问题与学习画像组织回答"
    )

    stream.thinking(
        f"任务识别：目标={goal}；水平={level}；主题={_join_or_none(topics)}。"
    )
    stream.thinking(
        f"学情画像：薄弱点={_join_or_none(weak_points)}；偏好={_join_or_none(preferences)}；约束={_join_or_none(constraints)}。"
    )
    stream.thinking(f"依据来源：{evidence}。")
    stream.thinking(
        f"处理链路：当前进入“{module_labels.get(capability_name, '综合导学')}”模块，围绕目标、路径、资源与反馈进行组织。"
    )
    stream.thinking(
        "质量标准：回答需要包含概念解释、可执行步骤、练习安排、验收标准与后续调整建议。"
    )


def _join_or_none(items: list[str]) -> str:
    return "、".join(str(item) for item in items[:4]) if items else "暂无"
