"""单链表反转（三指针法）步骤动画模板（参数化）。

参数：{"values": [int, ...]}
渲染：python -m manim -qm <thisfile> LinkedListReversalScene
"""
from __future__ import annotations

from manim import (
    BOLD, DOWN, LEFT, RIGHT, UP, Arrow, Create, FadeIn, FadeOut, GrowArrow,
    Indicate, Rectangle, Scene, Text, Transform, VGroup,
)

from ._base import cjk_font, load_params

CJK = cjk_font()
NODE_C = "#3A3A38"
PREV_C = "#1D9E75"
CURR_C = "#EF9F27"
ARROW_OLD = "#888780"
ARROW_NEW = "#378ADD"
NEUTRAL = "#5F5E5A"


class LinkedListReversalScene(Scene):
    def construct(self) -> None:
        params = load_params({"values": [1, 2, 3, 4]})
        vals = _sanitize(params.get("values"))
        n = len(vals)

        title = Text("单链表反转 · 三指针法", font=CJK, weight=BOLD).scale(0.6).to_edge(UP, buff=0.45)
        sub = Text("prev / curr 逐个把指针掉头", font=CJK).scale(0.36)
        sub.set_color(NEUTRAL).next_to(title, DOWN, buff=0.18)
        self.play(FadeIn(title), FadeIn(sub))

        nw, gap = 0.92, 1.05
        total = n * nw + (n - 1) * gap
        x0 = -total / 2 + nw / 2
        nodes, node_x = [], []
        for k, v in enumerate(vals):
            x = x0 + k * (nw + gap)
            node_x.append(x)
            rect = Rectangle(width=nw, height=0.9, fill_opacity=1, stroke_width=2)
            rect.set_fill(NODE_C).set_stroke("#888780").move_to([x, 0.25, 0])
            num = Text(str(v), font=CJK).scale(0.5).move_to(rect.get_center())
            nodes.append(VGroup(rect, num))

        null_left = Text("NULL", font=CJK).scale(0.34).set_color(NEUTRAL)
        null_left.move_to([x0 - (nw + gap), 0.25, 0])
        head = Text("头", font=CJK).scale(0.38).set_color(CURR_C).next_to(nodes[0], UP, buff=0.45)

        self.play(*[Create(nd[0]) for nd in nodes], run_time=0.7)
        self.play(*[FadeIn(nd[1]) for nd in nodes], FadeIn(null_left), FadeIn(head), run_time=0.4)

        arrows = []
        for k in range(n - 1):
            ar = Arrow(
                nodes[k][0].get_right(), nodes[k + 1][0].get_left(),
                buff=0.08, stroke_width=4, max_tip_length_to_length_ratio=0.25,
            ).set_color(ARROW_OLD)
            arrows.append(ar)
        self.play(*[GrowArrow(a) for a in arrows], run_time=0.6)

        def ptr(txt: str, color: str, idx_x: float) -> VGroup:
            lab = Text(txt, font=CJK).scale(0.34).set_color(color)
            lab.move_to([idx_x, -0.7, 0])
            return lab

        prev_p = ptr("prev", PREV_C, null_left.get_x())
        curr_p = ptr("curr", CURR_C, node_x[0])
        self.play(FadeIn(prev_p), FadeIn(curr_p))

        for i in range(n):
            self.play(Indicate(nodes[i][0], color=CURR_C), run_time=0.4)
            if i == 0:
                new_arrow = Arrow(
                    nodes[0][0].get_left(), null_left.get_right(),
                    buff=0.08, stroke_width=4, max_tip_length_to_length_ratio=0.3,
                ).set_color(ARROW_NEW)
                self.play(GrowArrow(new_arrow), run_time=0.5)
            else:
                rev = Arrow(
                    nodes[i][0].get_left(), nodes[i - 1][0].get_right(),
                    buff=0.08, stroke_width=4, max_tip_length_to_length_ratio=0.25,
                ).set_color(ARROW_NEW)
                self.play(Transform(arrows[i - 1], rev), run_time=0.5)

            prev_target = node_x[i]
            curr_target = node_x[i + 1] if i + 1 < n else node_x[-1] + (nw + gap)
            self.play(
                prev_p.animate.move_to([prev_target, -0.7, 0]),
                curr_p.animate.move_to([curr_target, -0.7, 0]),
                run_time=0.45,
            )
            self.wait(0.15)

        self.play(curr_p.animate.set_opacity(0.3))
        new_head = Text("头", font=CJK).scale(0.38).set_color(CURR_C).next_to(nodes[-1], UP, buff=0.45)
        self.play(FadeOut(head), FadeIn(new_head), run_time=0.5)
        done = Text("反转完成：方向整体掉头", font=CJK).scale(0.42).set_color(ARROW_NEW).to_edge(DOWN, buff=0.5)
        self.play(FadeIn(done))
        self.wait(1.8)


def _sanitize(values: object) -> list[int]:
    out: list[int] = []
    if isinstance(values, list):
        for v in values:
            try:
                iv = int(v)
            except (TypeError, ValueError):
                continue
            if 0 <= iv <= 99:
                out.append(iv)
    if len(out) < 3:
        out = [1, 2, 3, 4]
    return out[:5]
