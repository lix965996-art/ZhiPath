"use client";

import { useMemo } from "react";
import type { ReviewCalendar } from "@/lib/api";

/**
 * FSRS 复习日历：未来 N 天每天该复习多少张卡片。
 * 颜色按数量浓淡（类似 GitHub 贡献图），点击日期切换 active。
 */
export function ReviewCalendarView({
  calendar,
  onPickDay,
}: {
  calendar: ReviewCalendar;
  onPickDay?: (date: string) => void;
}) {
  const days = useMemo(() => {
    const today = new Date(calendar.today);
    const out: { date: string; count: number; cards: any[] }[] = [];
    for (let i = -3; i <= 14; i += 1) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      const cards = calendar.buckets[key] ?? [];
      out.push({ date: key, count: cards.length, cards });
    }
    return out;
  }, [calendar]);

  const maxCount = useMemo(
    () => days.reduce((m, d) => Math.max(m, d.count), 1),
    [days],
  );

  const stats = calendar.stats;

  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="grid grid-cols-4 gap-3 text-xs">
        <Stat label="待复习" value={stats.review + stats.relearning} />
        <Stat label="新卡片" value={stats.new} />
        <Stat label="已巩固 ≥21d" value={stats.mature_count} />
        <Stat
          label="平均稳定性"
          value={`${stats.avg_stability.toFixed(1)}d`}
        />
      </div>

      <div className="grid grid-cols-9 gap-1">
        {days.map((d) => {
          const intensity = Math.min(1, d.count / maxCount);
          const isToday = d.date === calendar.today;
          return (
            <button
              key={d.date}
              type="button"
              onClick={() => onPickDay?.(d.date)}
              className={`flex flex-col items-center rounded-lg border px-1 py-1.5 text-[10px] transition ${
                isToday
                  ? "border-blue-400 ring-2 ring-blue-200"
                  : "border-slate-100"
              }`}
              style={{
                background: d.count
                  ? `rgba(16,185,129,${0.15 + intensity * 0.65})`
                  : "#fff",
                color: d.count > 0 ? "#064e3b" : "#94a3b8",
              }}
            >
              <span className="text-[9px] text-slate-500">{d.date.slice(5)}</span>
              <span className="text-sm font-bold">{d.count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2">
      <div className="text-[10px] text-slate-500">{label}</div>
      <div className="text-base font-semibold text-slate-900">{value}</div>
    </div>
  );
}
