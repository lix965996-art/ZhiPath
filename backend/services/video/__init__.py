"""视频讲解生成：Manim 模板渲染 + 讯飞 TTS 旁白 + ffmpeg 合成。

对外入口：
    from services.video import generate_lesson_video, match_template
"""
from services.video.registry import TEMPLATES, match_template
from services.video.service import generate_lesson_video

__all__ = ["generate_lesson_video", "match_template", "TEMPLATES"]
