"""Manim 模板公共工具：从环境变量注入的 JSON 读取参数 + 中文字体选择。

渲染器把校验过的参数写成临时 JSON，通过环境变量 ZHIPATH_VIDEO_PARAMS 传给
被 manim CLI 加载的模板模块。模板只消费数据，绝不执行 LLM 生成的代码。
"""
from __future__ import annotations

import json
import os
import sys
from typing import Any


def load_params(default: dict[str, Any]) -> dict[str, Any]:
    """读取渲染器注入的参数；缺失或损坏时回退默认值。"""
    path = os.getenv("ZHIPATH_VIDEO_PARAMS")
    if not path or not os.path.exists(path):
        return dict(default)
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict):
            merged = dict(default)
            merged.update(data)
            return merged
    except Exception:
        pass
    return dict(default)


def cjk_font() -> str:
    """中文字体名：Windows 用雅黑，其它平台交给 manim 默认字体。"""
    if sys.platform == "win32":
        return "Microsoft YaHei"
    return ""
