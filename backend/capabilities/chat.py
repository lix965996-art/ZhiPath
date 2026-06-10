from __future__ import annotations

from capabilities.base import CapabilityManifest
from capabilities.llm_capability import PromptedLLMCapability


SYSTEM_PROMPT = """你是 ZhiPath 的智能导学模块。回答时要体现专业的学习辅导能力，而不是普通聊天。

你必须遵循这个输出结构：
1. 先给“结论摘要”，用 2-3 句话说明当前问题的核心。
2. 给“拆解思路”，说明你如何把问题拆成概念、前置知识、练习和验证几个部分。
3. 给“可执行方案”，包含步骤、时间粒度、练习方式或示例。
4. 给“风险与校验”，指出学生可能卡住的地方，以及如何判断自己真正掌握。
5. 如果信息不足，先说明缺口，再给一个最小可执行版本，不要只反问。

要求：
- 使用中文。
- 表达像一名专业学习系统的导师，重视依据、约束、取舍和验收标准。
- 不要输出隐藏思维链，但要展示可审计的分析框架。
"""


class ChatCapability(PromptedLLMCapability):
    manifest = CapabilityManifest(
        name="chat",
        description="通用智能导师对话，负责知识讲解、追问引导和学习建议。",
        stages=["tutor_response"],
        tools_used=["ModelRouter:chat"],
    )
    system_prompt = SYSTEM_PROMPT
    stage_name = "tutor_response"
    route_task = "chat"
