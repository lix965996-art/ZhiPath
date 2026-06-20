"""FIFO 页面置换步骤动画模板（参数化）。

参数：{"frames": int, "stream": [int, ...]}
渲染：python -m manim -qm <thisfile> PageReplacementScene
"""
from __future__ import annotations

from manim import (
    BOLD, DOWN, LEFT, RIGHT, UP, Create, FadeIn, FadeOut, Flash, Indicate,
    Rectangle, Scene, Text, Transform, VGroup,
)

from ._base import cjk_font, load_params

CJK = cjk_font()
HIT_C = "#1D9E75"
MISS_C = "#EF9F27"
NEUTRAL = "#5F5E5A"
FRAME_BG = "#3A3A38"


class PageReplacementScene(Scene):
    def construct(self) -> None:
        params = load_params({"frames": 3, "stream": [7, 0, 1, 2, 0, 3, 0, 4, 2, 3]})
        n_frames = _clamp(params.get("frames"), 2, 4, 3)
        stream = _sanitize_stream(params.get("stream"))

        title = Text("FIFO 页面置换", font=CJK, weight=BOLD).scale(0.6).to_edge(UP, buff=0.45)
        sub = Text("缺页时换出最早进入内存的页", font=CJK).scale(0.36)
        sub.set_color(NEUTRAL).next_to(title, DOWN, buff=0.18)
        self.play(FadeIn(title), FadeIn(sub))

        # 引用串
        sw, sgap = 0.6, 0.12
        total = len(stream) * sw + (len(stream) - 1) * sgap
        sx0 = -total / 2 + sw / 2
        stream_boxes, stream_x = [], []
        for k, p in enumerate(stream):
            x = sx0 + k * (sw + sgap)
            stream_x.append(x)
            box = Rectangle(width=sw, height=sw, fill_opacity=1, stroke_width=1.5)
            box.set_fill("#2C2C2A").set_stroke("#5F5E5A").move_to([x, 1.7, 0])
            num = Text(str(p), font=CJK).scale(0.36).move_to(box.get_center())
            stream_boxes.append(VGroup(box, num))
        label_stream = Text("引用串", font=CJK).scale(0.3).set_color(NEUTRAL)
        label_stream.next_to(VGroup(*stream_boxes), LEFT, buff=0.3)
        self.play(*[FadeIn(b) for b in stream_boxes], FadeIn(label_stream), run_time=0.6)

        # 页框
        fw, fgap = 1.1, 0.3
        fx0 = -((n_frames - 1) * (fw + fgap)) / 2
        slot_rects, slot_texts = [], []
        for i in range(n_frames):
            x = fx0 + i * (fw + fgap)
            rect = Rectangle(width=fw, height=0.85, fill_opacity=1, stroke_width=2)
            rect.set_fill(FRAME_BG).set_stroke("#888780").move_to([x, -0.3, 0])
            txt = Text("·", font=CJK).scale(0.5).set_color("#888780").move_to(rect.get_center())
            tag = Text(f"页框{i}", font=CJK).scale(0.26).set_color(NEUTRAL).next_to(rect, DOWN, buff=0.1)
            slot_rects.append(rect)
            slot_texts.append(txt)
            self.add(tag)
        self.play(*[Create(r) for r in slot_rects], *[FadeIn(t) for t in slot_texts], run_time=0.6)

        status = Text("", font=CJK).scale(0.4).move_to([0, -1.7, 0])
        miss_count = 0
        counter = Text("缺页次数：0", font=CJK).scale(0.4).set_color(MISS_C).to_edge(DOWN, buff=0.5)
        self.play(FadeIn(counter))

        frame_pages: list[int | None] = [None] * n_frames
        fifo: list[int] = []  # 槽位索引，按进入顺序
        cursor = Rectangle(width=sw + 0.1, height=sw + 0.1, stroke_width=3).set_stroke(HIT_C)

        for k, p in enumerate(stream):
            if k == 0:
                cursor.move_to(stream_boxes[0][0].get_center())
                self.play(Create(cursor), run_time=0.3)
            else:
                self.play(cursor.animate.move_to(stream_boxes[k][0].get_center()), run_time=0.35)

            if p in frame_pages:
                slot = frame_pages.index(p)
                cursor.set_stroke(HIT_C)
                self.play(
                    Indicate(slot_rects[slot], color=HIT_C),
                    slot_rects[slot].animate.set_stroke(HIT_C),
                    run_time=0.45,
                )
                self.play(slot_rects[slot].animate.set_stroke("#888780"), run_time=0.2)
                new_status = Text(f"页 {p}：命中", font=CJK).scale(0.4).set_color(HIT_C).move_to([0, -1.7, 0])
            else:
                miss_count += 1
                cursor.set_stroke(MISS_C)
                if None in frame_pages:
                    slot = frame_pages.index(None)
                else:
                    slot = fifo.pop(0)
                frame_pages[slot] = p
                fifo.append(slot)
                new_txt = Text(str(p), font=CJK).scale(0.5).set_color("#F1EFE8").move_to(slot_rects[slot].get_center())
                self.play(
                    slot_rects[slot].animate.set_fill(MISS_C).set_stroke("#854F0B"),
                    Transform(slot_texts[slot], new_txt),
                    Flash(slot_rects[slot], color=MISS_C, flash_radius=0.7, line_length=0.18),
                    run_time=0.55,
                )
                self.play(slot_rects[slot].animate.set_fill(FRAME_BG).set_stroke("#888780"), run_time=0.2)
                new_status = Text(f"页 {p}：缺页 → 换入", font=CJK).scale(0.4).set_color(MISS_C).move_to([0, -1.7, 0])

            new_counter = Text(f"缺页次数：{miss_count}", font=CJK).scale(0.4).set_color(MISS_C).to_edge(DOWN, buff=0.5)
            if status.text:
                self.play(Transform(status, new_status), Transform(counter, new_counter), run_time=0.25)
            else:
                status.become(new_status)
                self.add(status)
                self.play(Transform(counter, new_counter), run_time=0.2)
            self.wait(0.15)

        self.play(Indicate(counter, color=MISS_C), run_time=0.8)
        self.wait(1.8)


def _clamp(value: object, lo: int, hi: int, default: int) -> int:
    try:
        v = int(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return default
    return max(lo, min(hi, v))


def _sanitize_stream(stream: object) -> list[int]:
    out: list[int] = []
    if isinstance(stream, list):
        for v in stream:
            try:
                iv = int(v)
            except (TypeError, ValueError):
                continue
            if 0 <= iv <= 9:
                out.append(iv)
    if len(out) < 5:
        out = [7, 0, 1, 2, 0, 3, 0, 4, 2, 3]
    return out[:12]
