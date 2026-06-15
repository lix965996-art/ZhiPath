"""代码实操主题适用性判定。

只在「适合写 C 代码」的 408 主题生成代码实操，不适合时返回 null/空，
不再硬凑出只会打印知识点清单的假代码。
"""
from __future__ import annotations

# 每个学科一组关键词；命中任一即认为该主题适合做 C 语言实操。
# 与 prompt 里的白名单保持一致。
_CODE_SUITABLE_TOPICS: dict[str, tuple[str, ...]] = {
    "数据结构": ("链表", "栈", "队列", "二叉树", "树", "遍历", "排序", "查找", "搜索", "哈希", "图遍历", "邻接"),
    "操作系统": ("进程", "死锁", "银行家", "页面置换", "页替换", "置换", "调度", "信号量", "pv操作"),
    "计算机网络": ("端口", "子网", "tcp", "udp", "校验和", "校验", "tcp状态", "握手", "分片"),
    "计算机组成原理": ("cache", "缓存", "映射", "页号", "页内", "偏移", "指令", "字段", "地址拆分", "主存"),
}


def _normalize(text: str) -> str:
    return (text or "").lower()


def topic_supports_code(*texts: str | None) -> bool:
    """判断给定文本（用户需求 / 学习目标 / 主题）是否落在代码实操允许范围内。"""
    haystack = _normalize(" ".join(t for t in texts if t))
    if not haystack:
        return False
    return any(_normalize(kw) in haystack for kws in _CODE_SUITABLE_TOPICS.values() for kw in kws)


def code_suitable_subjects() -> list[str]:
    """返回允许做代码实操的学科清单（给 prompt / 调试用）。"""
    return list(_CODE_SUITABLE_TOPICS.keys())
