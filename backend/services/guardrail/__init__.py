"""防幻觉与内容安全护栏：引用追溯 (citation) + 敏感内容审核 (safety)。

赛题非功能需求第 3 条："系统需具备完善的'防幻觉'与内容安全过滤机制，
确保生成的学术内容无事实性错误、无敏感违规信息。"
"""

from .citation import CitedKnowledgeContext, build_cited_context, extract_citation_sources
from .safety import ContentSafetyResult, check_content_safety

__all__ = [
    "CitedKnowledgeContext",
    "build_cited_context",
    "extract_citation_sources",
    "ContentSafetyResult",
    "check_content_safety",
]
