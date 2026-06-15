"use client";

import type { LearningProfile } from "@/lib/api";

/** 浅色学习者画像 Hero —— 统一品牌蓝紫，简洁。真实数据驱动。 */
export function LearnerHero({ profile, sessionTitle }: { profile: LearningProfile; sessionTitle: string }) {
  const cov = profile.dimension_coverage;
  const score = cov?.score ?? 0;
  const total = cov?.total ?? 8;
  const ratio = cov?.ratio ?? (total ? score / total : 0);
  const initial = ((sessionTitle || profile.learning_goal || "我").trim().charAt(0)) || "我";
  const days = examDays(profile.exam_context?.exam_date);

  const R = 46;
  const C = 2 * Math.PI * R;
  const off = C * (1 - Math.max(0, Math.min(1, ratio)));

  const stats = [
    { label: "对话轮次", value: profile.turn_count ?? 0 },
    { label: "证据", value: profile.evidence_log?.length ?? 0 },
    { label: "薄弱点", value: profile.weak_points?.length ?? 0 },
    { label: "画像维度", value: `${score}/${total}` },
  ];

  return (
    <section className="overflow-hidden rounded-[28px] border border-black/[0.06] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_22px_50px_-30px_rgba(15,23,42,0.22)]">
      <div className="h-1 w-full" style={{ background: "linear-gradient(90deg, #007AFF, #7c3aed)" }} />
      <div className="flex flex-wrap items-center gap-6 p-6">
        <div className="shrink-0 text-center">
          <div className="relative h-[120px] w-[120px]">
            <svg width={120} height={120} viewBox="0 0 120 120">
              <defs>
                <linearGradient id="lh-ring" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#007AFF" />
                  <stop offset="100%" stopColor="#7c3aed" />
                </linearGradient>
              </defs>
              <circle cx={60} cy={60} r={R} fill="none" stroke="#ecebf5" strokeWidth={7} />
              <circle
                cx={60}
                cy={60}
                r={R}
                fill="none"
                stroke="url(#lh-ring)"
                strokeWidth={7}
                strokeLinecap="round"
                strokeDasharray={C}
                strokeDashoffset={off}
                transform="rotate(-90 60 60)"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span
                className="text-[34px] font-bold"
                style={{ background: "linear-gradient(135deg, #007AFF, #7c3aed)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}
              >
                {initial}
              </span>
            </div>
          </div>
          <div className="mt-1 text-[11px] text-[#86868b]">{score}/{total} 维度覆盖</div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#007AFF]">学习者画像</p>
            {days != null ? (
              <span className="rounded-full bg-[rgba(124,58,237,0.08)] px-2.5 py-0.5 text-[11px] font-medium text-[#7c3aed]">
                408 · 还剩 {days} 天
              </span>
            ) : null}
          </div>
          <h1 className="mt-1.5 line-clamp-2 text-[22px] font-semibold leading-snug tracking-tight text-[#1d1d1f]">
            {profile.learning_goal || "尚未表达学习目标"}
          </h1>
          <p className="mt-1 text-[13px] text-[#86868b]">
            {profile.level || "水平待识别"} · {profile.topics?.length ? profile.topics.slice(0, 3).join(" / ") : "主题待识别"}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {stats.map((s) => (
              <span key={s.label} className="inline-flex items-baseline gap-1.5 rounded-full border border-black/[0.06] bg-[#f5f5f7] px-3 py-1.5">
                <span className="text-[15px] font-semibold text-[#1d1d1f]" style={{ fontVariantNumeric: "tabular-nums" }}>{s.value}</span>
                <span className="text-[11px] text-[#86868b]">{s.label}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function examDays(date?: string): number | null {
  if (!date) return null;
  const t = new Date(date).getTime();
  if (Number.isNaN(t)) return null;
  const diff = Math.ceil((t - Date.now()) / 86400000);
  return diff > 0 ? diff : null;
}
