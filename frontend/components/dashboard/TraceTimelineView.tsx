"use client";

import { useMemo } from "react";
import type { TraceSpan } from "@/lib/api";

/**
 * Trace 甘特图：横向时间线 + 嵌套 span。
 * 体现"工程化的多智能体可观测性"。
 */
export function TraceTimelineView({ spans }: { spans: TraceSpan[] }) {
  const sorted = useMemo(
    () => [...spans].sort((a, b) => a.start_time - b.start_time),
    [spans],
  );

  if (sorted.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-xs text-slate-400">
        本次会话尚无 Trace 数据。在 ZhiPath 主界面发起一轮交互后再返回。
      </div>
    );
  }

  const t0 = sorted[0].start_time;
  const tn = Math.max(...sorted.map((s) => s.end_time ?? s.start_time));
  const total = Math.max(0.001, tn - t0);

  return (
    <div className="space-y-1 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
        <span>共 {sorted.length} 个 span · 总时长 {(total * 1000).toFixed(0)} ms</span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5">OpenTelemetry 语义</span>
      </div>
      <div className="space-y-1">
        {sorted.map((s) => {
          const start = s.start_time - t0;
          const end = (s.end_time ?? s.start_time) - t0;
          const left = (start / total) * 100;
          const width = Math.max(1.5, ((end - start) / total) * 100);
          const color = kindColor(s.kind);
          return (
            <div
              key={s.span_id}
              className="grid grid-cols-[180px_1fr_64px] items-center gap-2"
            >
              <div className="truncate text-[11px] text-slate-700" title={s.name}>
                <span
                  className="mr-1 inline-block rounded px-1 text-[9px] font-semibold text-white"
                  style={{ background: color }}
                >
                  {s.kind}
                </span>
                {s.name}
              </div>
              <div className="relative h-5 rounded-md bg-slate-100">
                <div
                  className="absolute top-0 h-5 rounded-md"
                  style={{
                    left: `${left}%`,
                    width: `${width}%`,
                    background: s.status === "error" ? "#fecaca" : color,
                    opacity: s.status === "error" ? 1 : 0.8,
                  }}
                  title={`${s.name} · ${s.duration_ms ?? 0}ms${s.error_message ? ` · ${s.error_message}` : ""}`}
                />
              </div>
              <div className="text-right text-[11px] font-mono text-slate-600">
                {s.duration_ms ?? 0}ms
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function kindColor(kind: string): string {
  switch (kind) {
    case "agent":
      return "#0ea5e9";
    case "llm":
      return "#8b5cf6";
    case "tool":
      return "#10b981";
    case "db":
      return "#f59e0b";
    default:
      return "#475569";
  }
}
