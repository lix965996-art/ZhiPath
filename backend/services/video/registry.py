"""视频模板注册表：主题路由、参数构造、旁白脚本。

新增模板 = 在 TEMPLATES 里加一项 + 写一个参数化 Scene 模块。
LLM/系统只负责"选模板 + 填数据 + 生成旁白"，绝不生成可执行画面代码。
"""
from __future__ import annotations

import importlib
import re
from typing import Any, Callable


def _quicksort_params(text: str) -> dict[str, Any]:
    arr = _extract_int_list(text)
    return {"array": arr or [7, 2, 5, 3, 8, 4]}


def _quicksort_narration(params: dict[str, Any]) -> str:
    arr = params.get("array") or [7, 2, 5, 3, 8, 4]
    pivot = arr[-1]
    return (
        f"快速排序的核心是分区。我们以数组末位的{pivot}作为基准。"
        "指针从左到右扫描，每遇到一个不大于基准的元素，就把它交换到左边。"
        "扫描结束后，再把基准放回中间。"
        "这时，基准左边都不大于它，右边都大于它，一次分区就完成了。"
    )


def _binary_search_params(text: str) -> dict[str, Any]:
    arr = _extract_int_list(text)
    target = _extract_target(text)
    params: dict[str, Any] = {}
    if arr:
        params["array"] = sorted(set(arr))
    if target is not None:
        params["target"] = target
    return params


def _binary_search_narration(params: dict[str, Any]) -> str:
    arr = params.get("array") or [2, 4, 7, 10, 15, 21, 28, 33]
    target = params.get("target", arr[len(arr) // 2])
    return (
        f"二分查找要求数组有序。我们要找的是{target}。"
        "每次取中间的元素和目标比较：相等就找到了；"
        "中间值偏小，就去右半边继续找；偏大，就去左半边。"
        "因为每一步都把范围砍掉一半，所以查找非常快。"
    )


def _page_replacement_params(text: str) -> dict[str, Any]:
    params: dict[str, Any] = {}
    m = re.search(r"(\d)\s*(?:个)?\s*(?:页框|帧|frame)", text)
    if m:
        params["frames"] = int(m.group(1))
    stream = _extract_int_list(text)
    if len(stream) >= 5:
        params["stream"] = stream
    return params


def _page_replacement_narration(params: dict[str, Any]) -> str:
    frames = params.get("frames", 3)
    return (
        f"先进先出页面置换有{frames}个页框。每来一个页号，先看它在不在内存里："
        "在就命中，不缺页；不在就发生缺页，如果还有空页框就直接放进去，"
        "否则换出最早进入内存的那一页。我们一路统计总的缺页次数。"
    )


def _linked_list_params(text: str) -> dict[str, Any]:
    vals = _extract_int_list(text)
    return {"values": vals} if len(vals) >= 3 else {}


def _linked_list_narration(params: dict[str, Any]) -> str:
    return (
        "单链表反转用三个指针：prev、curr、next。"
        "每一步先用 next 记住后继，再把 curr 的指针掉头指向 prev，"
        "然后 prev 和 curr 一起向右移动。"
        "当 curr 走到空，prev 就成了新的头结点，整条链表方向就反过来了。"
    )


TEMPLATES: dict[str, dict[str, Any]] = {
    "quicksort": {
        "module": "services.video.templates.quicksort",
        "scene": "QuickSortScene",
        "title": "快速排序分区动画",
        "topic": "快速排序",
        "keywords": ["快速排序", "快排", "quicksort", "quick sort", "分区", "partition", "lomuto"],
        "build_params": _quicksort_params,
        "narration": _quicksort_narration,
    },
    "binary_search": {
        "module": "services.video.templates.binary_search",
        "scene": "BinarySearchScene",
        "title": "二分查找动画",
        "topic": "二分查找",
        "keywords": ["二分查找", "二分", "折半查找", "折半", "binary search"],
        "build_params": _binary_search_params,
        "narration": _binary_search_narration,
    },
    "page_replacement": {
        "module": "services.video.templates.page_replacement",
        "scene": "PageReplacementScene",
        "title": "FIFO 页面置换动画",
        "topic": "页面置换",
        "keywords": ["页面置换", "fifo", "缺页", "页框", "page replacement", "先进先出"],
        "build_params": _page_replacement_params,
        "narration": _page_replacement_narration,
    },
    "linked_list_reversal": {
        "module": "services.video.templates.linked_list_reversal",
        "scene": "LinkedListReversalScene",
        "title": "单链表反转动画",
        "topic": "链表反转",
        "keywords": ["链表反转", "反转链表", "单链表", "链表逆置", "reverse linked list", "逆置"],
        "build_params": _linked_list_params,
        "narration": _linked_list_narration,
    },
}


def match_template(text: str) -> str | None:
    """按关键词把用户需求/主题路由到模板，命中返回 template_key。"""
    if not text:
        return None
    lower = text.lower()
    for key, spec in TEMPLATES.items():
        for kw in spec["keywords"]:
            if kw.lower() in lower:
                return key
    return None


def get_scene_class(template_key: str):
    spec = TEMPLATES[template_key]
    module = importlib.import_module(spec["module"])
    return getattr(module, spec["scene"])


def build_params(template_key: str, text: str) -> dict[str, Any]:
    builder: Callable[[str], dict[str, Any]] = TEMPLATES[template_key]["build_params"]
    return builder(text or "")


def narration_for(template_key: str, params: dict[str, Any]) -> str:
    fn: Callable[[dict[str, Any]], str] = TEMPLATES[template_key]["narration"]
    return fn(params)


def _extract_int_list(text: str) -> list[int]:
    """从文本里抓第一段方括号或逗号分隔的整数序列，做演示数据。"""
    m = re.search(r"[\[\(]([0-9,\s，]+)[\]\)]", text)
    chunk = m.group(1) if m else ""
    if not chunk:
        m2 = re.search(r"(\d+(?:\s*[,，]\s*\d+){3,})", text)
        chunk = m2.group(1) if m2 else ""
    if not chunk:
        return []
    nums = []
    for part in re.split(r"[,\s，]+", chunk):
        if part.isdigit():
            v = int(part)
            if 0 <= v <= 99:
                nums.append(v)
    return nums[:9]


def _extract_target(text: str) -> int | None:
    m = re.search(r"(?:找|查找|搜索|target|目标)\D{0,4}(\d{1,2})", text)
    if m:
        return int(m.group(1))
    return None
