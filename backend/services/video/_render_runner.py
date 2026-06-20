"""隔离进程渲染入口：python -m services.video._render_runner <key> <params_json> <out_name> <media_dir> <quality>

单独进程跑 manim，避免污染后端主进程的 manim 全局状态；模板按包导入，相对 import 正常。
"""
from __future__ import annotations

import os
import sys


def main() -> int:
    if len(sys.argv) < 6:
        print("usage: _render_runner <key> <params_json> <out_name> <media_dir> <quality>", file=sys.stderr)
        return 2
    template_key, params_path, out_name, media_dir, quality = sys.argv[1:6]
    os.environ["ZHIPATH_VIDEO_PARAMS"] = params_path

    from manim import tempconfig
    from services.video.registry import get_scene_class

    scene_cls = get_scene_class(template_key)
    with tempconfig(
        {
            "quality": quality,
            "output_file": out_name,
            "media_dir": media_dir,
            "disable_caching": True,
            "verbosity": "ERROR",
        }
    ):
        scene_cls().render()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
