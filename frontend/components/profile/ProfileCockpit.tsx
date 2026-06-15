"use client";

import { useEffect, useRef, useState } from "react";
import type { LearningProfile } from "@/lib/api";

/**
 * 学情驾驶舱 —— 单一炫彩焦点：发光活力环 + 数字滚动 + 身份。
 * 全真实数据：dimension_coverage / evidence_log / turn_count / exam_context。
 */
export function ProfileCockpit({ profile, sessionTitle }: { profile: LearningProfile; sessionTitle: string }) {
  const cov = profile.dimension_coverage;
  const score = cov?.score ?? 0;
  const total = cov?.total ?? 8;
  const ratio = clamp01(cov?.ratio ?? (total ? score / total : 0));
  const ev = profile.evidence_log?.length ?? 0;
  const turns = profile.turn_count ?? 0;
  const initial = ((sessionTitle || profile.learning_goal || "我").trim().charAt(0)) || "我";
  const days = examDays(profile.exam_context?.exam_date);

  const rings = [
    { key: "cov", label: "画像完整度", value: ratio, sub: `${score}/${total} 维`, r: 92 },
    { key: "sig", label: "证据信号", value: clamp01(ev / 16), sub: `${ev} 条`, r: 70 },
    { key: "act", label: "学习活跃", value: clamp01(turns / 12), sub: `${turns} 轮`, r: 48 },
  ];

  const pct = useCountUp(Math.round(ratio * 100));
  const [grow, setGrow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setGrow(true), 90);
    return () => clearTimeout(t);
  }, []);

  const stats = [
    { label: "对话轮次", value: turns },
    { label: "证据", value: ev },
    { label: "薄弱点", value: profile.weak_points?.length ?? 0 },
    { label: "画像维度", value: `${score}/${total}` },
  ];

  return (
    <section
      className="relative overflow-hidden rounded-[28px] border border-white/60 p-6 sm:p-7"
      style={{
        background:
          "radial-gradient(110% 130% at 12% 0%, rgba(0,122,255,0.16) 0%, transparent 46%), radial-gradient(120% 130% at 100% 100%, rgba(124,58,237,0.18) 0%, transparent 48%), #ffffff",
        boxShadow: "0 1px 2px rgba(15,23,42,0.04), 0 30px 70px -34px rgba(80,40,160,0.45)",
      }}
    >
      <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: "linear-gradient(90deg,#007AFF,#7c3aed,#d946ef)" }} />

      <div className="flex flex-col items-center gap-7 sm:flex-row sm:items-center sm:gap-9">
        {/* 发光活力环 */}
        <div className="relative shrink-0">
          <svg width={232} height={232} viewBox="0 0 232 232" className="block">
            <defs>
              <linearGradient id="pc-cov" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#007AFF" />
                <stop offset="60%" stopColor="#7c3aed" />
                <stop offset="100%" stopColor="#d946ef" />
              </linearGradient>
              <linearGradient id="pc-sig" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#3b82f6" />
                <stop offset="100%" stopColor="#7c3aed" />
              </linearGradient>
              <linearGradient id="pc-act" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#7c3aed" />
                <stop offset="100%" stopColor="#c084fc" />
              </linearGradient>
              <filter id="pc-glow" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="4" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <g transform="rotate(-90 116 116)">
              {rings.map((ring) => {
                const c = 2 * Math.PI * ring.r;
                const offset = grow ? c * (1 - ring.value) : c;
                return (
                  <g key={ring.key}>
                    <circle cx={116} cy={116} r={ring.r} fill="none" stroke="rgba(120,120,128,0.12)" strokeWidth={13} />
                    <circle
                      cx={116}
                      cy={116}
                      r={ring.r}
                      fill="none"
                      stroke={`url(#pc-${ring.key})`}
                      strokeWidth={13}
                      strokeLinecap="round"
                      strokeDasharray={c}
                      strokeDashoffset={offset}
                      filter="url(#pc-glow)"
                      style={{ transition: "stroke-dashoffset 1.25s cubic-bezier(0.22,1,0.36,1)" }}
                    />
                  </g>
                );
              })}
            </g>
            <text x={116} y={110} textAnchor="middle" style={{ fontSize: 46, fontWeight: 700, fill: "#1d1d1f", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.03em" }}>
              {pct}
              <tspan style={{ fontSize: 20, fontWeight: 600, fill: "#86868b" }}>%</tspan>
            </text>
            <text x={116} y={132} textAnchor="middle" style={{ fontSize: 12, fill: "#86868b" }}>画像完整度</text>
          </svg>
        </div>

        {/* 身份 + 目标 + 数据 */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <span
              className="flex h-9 w-9 items-center justify-center rounded-full text-[16px] font-bold text-white"
              style={{ background: "linear-gradient(135deg,#007AFF,#7c3aed)" }}
            >
              {initial}
            </span>
            <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#007AFF]">学习者画像</span>
            {days != null ? (
              <span className="rounded-full px-2.5 py-0.5 text-[11px] font-medium text-white" style={{ background: "linear-gradient(135deg,#7c3aed,#d946ef)" }}>
                408 · 还剩 {days} 天
              </span>
            ) : null}
          </div>

          <h1 className="mt-3 line-clamp-2 text-[21px] font-semibold leading-snug tracking-tight text-[#1d1d1f]">
            {profile.learning_goal || "尚未表达学习目标"}
          </h1>
          <p className="mt-1 text-[13px] text-[#86868b]">
            {profile.level || "水平待识别"} · {profile.topics?.length ? profile.topics.slice(0, 3).join(" / ") : "主题待识别"}
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            {stats.map((s) => (
              <span key={s.label} className="inline-flex items-baseline gap-1.5 rounded-full border border-black/[0.06] bg-white/70 px-3 py-1.5 backdrop-blur">
                <span className="text-[15px] font-semibold text-[#1d1d1f]" style={{ fontVariantNumeric: "tabular-nums" }}>{s.value}</span>
                <span className="text-[11px] text-[#86868b]">{s.label}</span>
              </span>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5">
            {rings.map((ring) => (
              <span key={ring.key} className="inline-flex items-center gap-1.5 text-[12px] text-[#6e6e73]">
                <span style={{ width: 8, height: 8, borderRadius: 99, background: `url(#pc-${ring.key})`, backgroundColor: ring.key === "cov" ? "#007AFF" : ring.key === "sig" ? "#5b6cff" : "#a855f7" }} />
                {ring.label}
                <b className="ml-0.5 font-semibold text-[#1d1d1f]">{Math.round(ring.value * 100)}%</b>
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function useCountUp(target: number): number {
  const [v, setV] = useState(0);
  const ref = useRef<number>(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const dur = 1100;
    const from = ref.current;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      const cur = Math.round(from + (target - from) * eased);
      setV(cur);
      ref.current = cur;
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return v;
}

function examDays(date?: string): number | null {
  if (!date) return null;
  const t = new Date(date).getTime();
  if (Number.isNaN(t)) return null;
  const diff = Math.ceil((t - Date.now()) / 86400000);
  return diff > 0 ? diff : null;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
