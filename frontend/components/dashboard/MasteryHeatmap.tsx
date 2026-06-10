"use client";

import { useMemo } from "react";
import type { MasteryKC } from "@/lib/api";

/**
 * BKT 掌握度热力图：KC × 时间。每行一个知识点，每列一次答题观测，
 * 颜色按 mastery_after 着色（红 → 黄 → 绿）。
 */
export function MasteryHeatmap({ kcs }: { kcs: MasteryKC[] }) {
  const sorted = useMemo(
    () =>
      [...kcs]
        .filter((k) => k.history && k.history.length > 0)
        .sort((a, b) => a.mastery - b.mastery)
        .slice(0, 20),
    [kcs],
  );
  const maxLen = useMemo(
    () => sorted.reduce((m, k) => Math.max(m, k.history.length), 1),
    [sorted],
  );

  if (sorted.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-400">
        尚无答题记录。完成一次测验后这里会出现掌握度热力图。
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-4">
      <table className="min-w-full text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-white px-2 py-1 text-left font-semibold text-slate-700">
              知识点
            </th>
            <th className="px-2 py-1 text-left font-semibold text-slate-700">当前</th>
            {Array.from({ length: maxLen }).map((_, i) => (
              <th key={i} className="px-1 py-1 text-center text-[10px] text-slate-400">
                t{i + 1}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((kc) => (
            <tr key={kc.kc_id} className="border-t border-slate-100">
              <td className="sticky left-0 z-10 max-w-[180px] truncate bg-white px-2 py-1 text-slate-700">
                {kc.label}
              </td>
              <td className="px-2 py-1">
                <MasteryBadge value={kc.mastery} />
                <span className="ml-1 text-slate-400">{kc.attempts}次</span>
              </td>
              {Array.from({ length: maxLen }).map((_, i) => {
                const h = kc.history[i];
                if (!h) {
                  return <td key={i} className="px-1 py-1" />;
                }
                return (
                  <td key={i} className="px-0.5 py-1">
                    <div
                      title={`${h.correct ? "对" : "错"} → mastery ${(h.mastery_after * 100).toFixed(0)}%`}
                      className="mx-auto h-5 w-5 rounded"
                      style={{
                        background: scoreToColor(h.mastery_after),
                        outline: h.correct ? "none" : "1px solid #f87171",
                      }}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MasteryBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold text-white"
      style={{ background: scoreToColor(value, 1) }}
    >
      {pct}%
    </span>
  );
}

function scoreToColor(value: number, alpha = 0.85): string {
  // 0 → 红 #ef4444  · 0.5 → 黄 #facc15  · 1 → 绿 #10b981
  const clamped = Math.max(0, Math.min(1, value));
  let r: number, g: number, b: number;
  if (clamped < 0.5) {
    const t = clamped / 0.5;
    r = lerp(0xef, 0xfa, t);
    g = lerp(0x44, 0xcc, t);
    b = lerp(0x44, 0x15, t);
  } else {
    const t = (clamped - 0.5) / 0.5;
    r = lerp(0xfa, 0x10, t);
    g = lerp(0xcc, 0xb9, t);
    b = lerp(0x15, 0x81, t);
  }
  return `rgba(${r | 0}, ${g | 0}, ${b | 0}, ${alpha})`;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
