"""二分查找（折半查找）步骤动画模板（参数化）。

参数：{"array": [有序 int...], "target": int}
渲染：python -m manim -qm <thisfile> BinarySearchScene  （参数由 ZHIPATH_VIDEO_PARAMS 注入）
"""
from __future__ import annotations

from manim import (
    BOLD, DOWN, PI, UP, Create, FadeIn, FadeOut, Indicate, Rectangle,
    Scene, Text, Triangle, VGroup,
)

from ._base import cjk_font, load_params

CJK = cjk_font()
CELL_W = 1.0
CELL_H = 0.92
GAP = 0.18
MID_C = "#EF9F27"
FOUND_C = "#1D9E75"
LO_C = "#1D9E75"
HI_C = "#378ADD"
NEUTRAL = "#5F5E5A"
DIM = "#2C2C2A"


class BinarySearchScene(Scene):
    def construct(self) -> None:
        params = load_params({"array": [2, 4, 7, 10, 15, 21, 28, 33], "target": 21})
        vals = _sanitize_sorted(params.get("array"))
        n = len(vals)
        target = _sanitize_target(params.get("target"), vals)

        title = Text("二分查找 · 折半定位", font=CJK, weight=BOLD).scale(0.6).to_edge(UP, buff=0.5)
        sub = Text(f"在有序数组里找 {target}，每次砍掉一半", font=CJK).scale(0.36)
        sub.set_color(NEUTRAL).next_to(title, DOWN, buff=0.2)
        self.play(FadeIn(title), FadeIn(sub))

        cells, slot_x = [], []
        total_w = n * CELL_W + (n - 1) * GAP
        x0 = -total_w / 2 + CELL_W / 2
        for k, v in enumerate(vals):
            x = x0 + k * (CELL_W + GAP)
            slot_x.append(x)
            rect = Rectangle(width=CELL_W, height=CELL_H, fill_opacity=1, stroke_width=2)
            rect.set_fill(NEUTRAL).set_stroke("#B4B2A9").move_to([x, 0.3, 0])
            num = Text(str(v), font=CJK).scale(0.5).move_to(rect.get_center())
            idx = Text(str(k), font=CJK).scale(0.3).set_color("#888780").next_to(rect, UP, buff=0.12)
            cells.append(VGroup(rect, num, idx))

        self.play(*[Create(c[0]) for c in cells], run_time=0.8)
        self.play(*[FadeIn(c[1]) for c in cells], *[FadeIn(c[2]) for c in cells], run_time=0.4)

        def ptr(txt: str, color: str) -> VGroup:
            tri = Triangle(fill_opacity=1, stroke_width=0).set_fill(color).scale(0.13).rotate(PI)
            lab = Text(txt, font=CJK).scale(0.34).set_color(color).next_to(tri, DOWN, buff=0.06)
            return VGroup(tri, lab)

        lo_p, hi_p, mid_p = ptr("lo", LO_C), ptr("hi", HI_C), ptr("mid", MID_C)
        for p, idx in ((lo_p, 0), (hi_p, n - 1)):
            p.move_to([slot_x[idx], -0.55, 0])
        mid_p.move_to([slot_x[0], -0.55, 0]).set_opacity(0)
        self.play(FadeIn(lo_p), FadeIn(hi_p))

        def move(p: VGroup, idx: int):
            return p.animate.move_to([slot_x[idx], -0.55, 0])

        def dim(a: int, b: int) -> None:
            anims = []
            for k in range(a, b + 1):
                anims.append(cells[k][0].animate.set_fill(DIM).set_stroke("#444441"))
                anims.append(cells[k][1].animate.set_opacity(0.25))
            if anims:
                self.play(*anims, run_time=0.5)

        lo, hi, found = 0, n - 1, -1
        while lo <= hi:
            mid = (lo + hi) // 2
            self.play(mid_p.animate.set_opacity(1), move(mid_p, mid), run_time=0.45)
            self.play(
                cells[mid][0].animate.set_fill(MID_C).set_stroke("#854F0B"),
                Indicate(cells[mid][0], color=MID_C),
                run_time=0.5,
            )
            if vals[mid] == target:
                found = mid
                break
            if vals[mid] < target:
                dim(lo, mid)
                lo = mid + 1
                if lo <= hi:
                    self.play(move(lo_p, lo), run_time=0.4)
            else:
                dim(mid, hi)
                hi = mid - 1
                if lo <= hi:
                    self.play(move(hi_p, hi), run_time=0.4)
            self.wait(0.3)

        if found >= 0:
            self.play(cells[found][0].animate.set_fill(FOUND_C).set_stroke("#0F6E56"), run_time=0.4)
            self.play(cells[found][1].animate.set_opacity(1))
            msg = f"命中：下标 {found} 处等于 {target}"
            color = FOUND_C
        else:
            msg = f"区间为空：{target} 不在数组中"
            color = HI_C
        done = Text(msg, font=CJK).scale(0.42).set_color(color).to_edge(DOWN, buff=0.55)
        self.play(FadeOut(lo_p), FadeOut(hi_p), FadeOut(mid_p), FadeIn(done))
        self.wait(2.4)


def _sanitize_sorted(arr: object) -> list[int]:
    out: list[int] = []
    if isinstance(arr, list):
        for v in arr:
            try:
                iv = int(v)
            except (TypeError, ValueError):
                continue
            if 0 <= iv <= 99:
                out.append(iv)
    out = sorted(set(out))
    if len(out) < 5:
        out = [2, 4, 7, 10, 15, 21, 28, 33]
    return out[:9]


def _sanitize_target(target: object, vals: list[int]) -> int:
    try:
        t = int(target)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        t = vals[len(vals) // 2]
    if not (0 <= t <= 99):
        t = vals[len(vals) // 2]
    return t
