"use client";

import { useEffect, useState } from "react";
import type { LearningProfile } from "@/lib/api";

/**
 * iOS Fitness 风「学习活力环」—— 三条同心发光环，全真实数据驱动：
 * - 外环 画像完整度 = dimension_coverage.ratio
 * - 中环 证据信号    = evidence_log 条数 / 目标
 * - 内环 学习活跃    = turn_count / 目标
 * 不是考试分数，是画像信号强度。
 */
export function ActivityRings({ profile }: { profile: LearningProfile }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setOn(true), 80);
    return () => clearTimeout(t);
  }, []);

  const cov = profile.dimension_coverage;
  const ratio = cov?.ratio ?? (cov?.total ? cov.score / cov.total : 0);
  const ev = profile.evidence_log?.length ?? 0;
  const turns = profile.turn_count ?? 0;

  const rings = [
    { key: "cov", label: "画像完整度", sub: `${cov?.score ?? 0}/${cov?.total ?? 8} 维`, value: clamp01(ratio), r: 86, from: "#007AFF", to: "#5856d6" },
    { key: "sig", label: "证据信号", sub: `${ev} 条原话`, value: clamp01(ev / 16), r: 64, from: "#5856d6", to: "#7c3aed" },
    { key: "act", label: "学习活跃", sub: `${turns} 轮对话`, value: clamp01(turns / 12), r: 42, from: "#7c3aed", to: "#b06bff" },
  ];

  return (
    <section
      className="rounded-[28px] border border-black/[0.06] bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_22px_50px_-30px_rgba(15,23,42,0.25)]"
      style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif" }}
    >
      <div className="mb-1 text-[15px] font-semibold tracking-tight text-[#1d1d1f]">学习活力环</div>
      <div className="mb-5 text-[12px] text-[#86868b]">画像信号强度 · 越满信号越足(非考试分数)</div>

      <div className="flex flex-wrap items-center gap-7">
        <div className="relative mx-auto shrink-0">
          <svg width={208} height={208} viewBox="0 0 208 208">
            <defs>
              {rings.map((ring) => (
                <linearGradient key={ring.key} id={`ar-${ring.key}`} x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor={ring.from} />
                  <stop offset="100%" stopColor={ring.to} />
                </linearGradient>
              ))}
            </defs>
            <g transform="rotate(-90 104 104)">
              {rings.map((ring) => {
                const c = 2 * Math.PI * ring.r;
                const offset = on ? c * (1 - ring.value) : c;
                return (
                  <g key={ring.key}>
                    <circle cx={104} cy={104} r={ring.r} fill="none" stroke="rgba(120,120,128,0.14)" strokeWidth={15} />
                    <circle
                      cx={104}
                      cy={104}
                      r={ring.r}
                      fill="none"
                      stroke={`url(#ar-${ring.key})`}
                      strokeWidth={15}
                      strokeLinecap="round"
                      strokeDasharray={c}
                      strokeDashoffset={offset}
                      style={{
                        transition: "stroke-dashoffset 1.2s cubic-bezier(0.22,1,0.36,1)",
                        filter: `drop-shadow(0 0 5px ${ring.from}66)`,
                      }}
                    />
                  </g>
                );
              })}
            </g>
            <text x={104} y={98} textAnchor="middle" style={{ fontSize: 34, fontWeight: 700, fill: "#1d1d1f", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>
              {Math.round(ratio * 100)}
              <tspan style={{ fontSize: 16, fontWeight: 600, fill: "#86868b" }}>%</tspan>
            </text>
            <text x={104} y={120} textAnchor="middle" style={{ fontSize: 11, fill: "#86868b" }}>
              画像完整
            </text>
          </svg>
        </div>

        <div className="min-w-[160px] flex-1 space-y-4">
          {rings.map((ring) => (
            <div key={ring.key}>
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <span className="flex items-center gap-2 text-[13px] text-[#1d1d1f]">
                  <span style={{ width: 9, height: 9, borderRadius: 99, background: `linear-gradient(135deg, ${ring.from}, ${ring.to})` }} />
                  {ring.label}
                </span>
                <span style={{ fontSize: 14, fontWeight: 600, color: "#1d1d1f", fontVariantNumeric: "tabular-nums" }}>
                  {Math.round(ring.value * 100)}%
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-[#f0f0f2]">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: on ? `${Math.max(4, ring.value * 100)}%` : "0%",
                    background: `linear-gradient(90deg, ${ring.from}, ${ring.to})`,
                    transition: "width 1.2s cubic-bezier(0.22,1,0.36,1)",
                  }}
                />
              </div>
              <div className="mt-1 text-[11px] text-[#a1a1a6]">{ring.sub}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
