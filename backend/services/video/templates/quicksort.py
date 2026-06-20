"""快速排序 Lomuto 分区步骤动画模板（参数化）。

参数：{"array": [int, ...]}  末位元素作为基准。
渲染：python -m manim -qm <thisfile> QuickSortScene   （参数由 ZHIPATH_VIDEO_PARAMS 注入）
"""
from __future__ import annotations

from manim import (
    BOLD, DOWN, PI, UP, FadeIn, FadeOut, Flash, GrowFromEdge, Indicate,
    LaggedStart, Rectangle, Scene, Text, Triangle, VGroup,
)

from ._base import cjk_font, load_params

CJK = cjk_font()
BAR_W = 0.86
UNIT = 0.42
GAP = 0.30
BASE_Y = -2.4
PIVOT_C = "#EF9F27"
LE_C = "#1D9E75"
GT_C = "#378ADD"
NEUTRAL = "#888780"


class QuickSortScene(Scene):
    def construct(self) -> None:
        params = load_params({"array": [7, 2, 5, 3, 8, 4]})
        vals = _sanitize(params.get("array"))
        n = len(vals)
        pivot_val = vals[-1]

        title = Text("快速排序 · Lomuto 分区", font=CJK, weight=BOLD).scale(0.6).to_edge(UP, buff=0.5)
        sub = Text("以末位为基准，把 ≤ 基准的甩到左边", font=CJK).scale(0.36)
        sub.set_color(NEUTRAL).next_to(title, DOWN, buff=0.2)
        self.play(FadeIn(title), FadeIn(sub))

        cells, slot_x = [], []
        total_w = n * BAR_W + (n - 1) * GAP
        x0 = -total_w / 2 + BAR_W / 2
        for k, v in enumerate(vals):
            x = x0 + k * (BAR_W + GAP)
            slot_x.append(x)
            bar = Rectangle(width=BAR_W, height=v * UNIT, fill_opacity=1, stroke_width=0)
            bar.set_fill(NEUTRAL).move_to([x, BASE_Y + v * UNIT / 2, 0])
            num = Text(str(v), font=CJK).scale(0.42).next_to(bar, UP, buff=0.12)
            cells.append(VGroup(bar, num))
        order = list(cells)

        self.play(LaggedStart(*[GrowFromEdge(c[0], DOWN) for c in cells], lag_ratio=0.12), run_time=1.2)
        self.play(*[FadeIn(c[1]) for c in cells], run_time=0.4)

        order[n - 1][0].set_fill(PIVOT_C)
        plabel = Text(f"基准 = {pivot_val}", font=CJK).scale(0.4).set_color(PIVOT_C)
        plabel.next_to(order[n - 1], UP, buff=0.45)
        self.play(Indicate(order[n - 1][0], color=PIVOT_C), FadeIn(plabel))
        self.wait(0.7)

        def ptr(txt: str, color: str) -> VGroup:
            tri = Triangle(fill_opacity=1, stroke_width=0).set_fill(color).scale(0.14).rotate(PI)
            lab = Text(txt, font=CJK).scale(0.36).set_color(color).next_to(tri, DOWN, buff=0.08)
            return VGroup(tri, lab)

        i_ptr, j_ptr = ptr("i", LE_C), ptr("j", "#D4537E")
        i_ptr.move_to([slot_x[0], BASE_Y - 0.45, 0]).set_opacity(0)
        j_ptr.move_to([slot_x[0], BASE_Y - 0.45, 0])
        self.add(i_ptr, j_ptr)

        def move_ptr(p: VGroup, idx: int):
            return p.animate.move_to([slot_x[idx], BASE_Y - 0.45, 0])

        def swap(a: int, b: int) -> None:
            ca, cb = order[a], order[b]
            self.play(
                ca.animate.move_to([slot_x[b], ca.get_center()[1], 0]),
                cb.animate.move_to([slot_x[a], cb.get_center()[1], 0]),
                run_time=0.7,
            )
            order[a], order[b] = cb, ca

        i = -1
        for j in range(n - 1):
            self.play(move_ptr(j_ptr, j), run_time=0.4)
            self.play(Flash(order[j][0], color=GT_C, flash_radius=0.7, line_length=0.18), run_time=0.35)
            if _value_of(order[j]) <= pivot_val:
                i += 1
                self.play(i_ptr.animate.set_opacity(1), move_ptr(i_ptr, i), run_time=0.4)
                if i != j:
                    swap(i, j)
            self.wait(0.2)

        self.wait(0.3)
        swap(i + 1, n - 1)
        self.wait(0.5)

        for k in range(n):
            if k < i + 1:
                order[k][0].set_fill(LE_C)
            elif k == i + 1:
                order[k][0].set_fill(PIVOT_C)
            else:
                order[k][0].set_fill(GT_C)
        done = Text("基准归位：左边 ≤ 基准 ≤ 右边", font=CJK).scale(0.42).set_color(LE_C).to_edge(DOWN, buff=0.55)
        self.play(FadeOut(i_ptr), FadeOut(j_ptr), FadeIn(done))
        self.wait(2.4)


def _value_of(cell: VGroup) -> int:
    return int(cell[1].text)


def _sanitize(arr: object) -> list[int]:
    out: list[int] = []
    if isinstance(arr, list):
        for v in arr:
            try:
                iv = int(v)
            except (TypeError, ValueError):
                continue
            if 1 <= iv <= 99:
                out.append(iv)
    if len(out) < 4:
        out = [7, 2, 5, 3, 8, 4]
    return out[:8]
