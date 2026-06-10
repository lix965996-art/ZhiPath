"use client";

import { useMemo } from "react";
import type { ExamContext, LearningProfile, ProfileEvidenceEntry } from "@/lib/api";
import { GraduationCap, Sparkles, Timer } from "lucide-react";

interface Props {
  profile: LearningProfile;
  sessionTitle: string;
}

/**
 * 学习者 DNA Hero。
 * - 顶部"基因带"=两条流动渐变带，颜色 = 7 维度颜色串
 * - 左：身份卡 (头像 = 名字首字 + 双环 + 进度环)
 * - 右：实时统计 (画像维度覆盖率 / 累计证据 / 对话轮次)
 * - 底部：滚动证据带，最近 5 条原话片段循环滚动
 */
export function LearnerDNAHero({ profile, sessionTitle }: Props) {
  const coverage = profile.dimension_coverage;
  const ratio = coverage?.ratio ?? 0;
  const score = coverage?.score ?? 0;
  const total = coverage?.total ?? 7;

  const recent: ProfileEvidenceEntry[] = useMemo(() => {
    if (!profile.evidence_log) return [];
    return [...profile.evidence_log].reverse().slice(0, 8);
  }, [profile.evidence_log]);

  // 名字首字（取会话标题首字）
  const initial = (sessionTitle || "学").trim().charAt(0) || "学";

  return (
    <section className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[#070814] text-white shadow-[0_30px_80px_-30px_rgba(124,58,237,0.5)]">
      {/* 背景：基因色带 + 网格 */}
      <DNABackground />

      {/* 顶部装饰条 */}
      <div className="absolute inset-x-0 top-0 z-10 flex h-1.5 overflow-hidden">
        {DIM_COLORS.map((c, i) => (
          <span
            key={i}
            className="h-full flex-1"
            style={{
              background: `linear-gradient(90deg, ${c.color} 0%, ${c.color}55 100%)`,
              animation: `lf-dna-shimmer 3.4s ${i * 0.15}s ease-in-out infinite`,
            }}
          />
        ))}
      </div>

      {/* 408 考研倒计时带 — exam_context 命中才显示 */}
      {profile.exam_context && profile.exam_context.exam_code ? (
        <ExamCountdownBar exam={profile.exam_context} />
      ) : null}

      <div className="relative z-10 grid gap-6 px-7 pt-8 pb-6 sm:grid-cols-[auto_1fr] sm:gap-8">
        {/* 身份 + 进度环 */}
        <ProgressIdentity initial={initial} ratio={ratio} score={score} total={total} />

        {/* 文案 + 统计 */}
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.2em] text-white/40">
            Learner DNA · 学习者画像
          </p>
          <h1 className="mt-1 text-[28px] font-semibold leading-tight">
            {profile.learning_goal ? truncateText(profile.learning_goal, 38) : "尚未表达学习目标"}
          </h1>
          <p className="mt-1.5 text-[13px] text-white/55">
            {profile.level || "水平未知"} ·{" "}
            {profile.topics?.length ? profile.topics.slice(0, 3).join(" / ") : "主题待识别"}
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            <StatBadge
              label="对话轮次"
              value={profile.turn_count ?? 0}
              tint="#a78bfa"
            />
            <StatBadge
              label="证据"
              value={profile.evidence_log?.length ?? 0}
              tint="#22d3ee"
            />
            <StatBadge
              label="薄弱点"
              value={profile.weak_points?.length ?? 0}
              tint="#f43f5e"
            />
            <StatBadge
              label="偏好"
              value={profile.preferences?.length ?? 0}
              tint="#10b981"
            />
            {typeof profile.quiz_accuracy === "number" ? (
              <StatBadge
                label="测验准确率"
                value={`${Math.round((profile.quiz_accuracy ?? 0) * 100)}%`}
                tint="#f59e0b"
              />
            ) : null}
          </div>
        </div>
      </div>

      {/* 底部证据滚动带 */}
      {recent.length > 0 ? (
        <div className="relative z-10 overflow-hidden border-t border-white/10 bg-white/[0.03]">
          <div
            className="flex gap-4 whitespace-nowrap py-2.5 text-[11px] text-white/65"
            style={{
              animation: `lf-dna-marquee ${Math.max(20, recent.length * 4)}s linear infinite`,
            }}
          >
            {[...recent, ...recent].map((entry, i) => {
              const dim = DIM_COLORS.find((d) => d.key === entry.dimension);
              return (
                <span
                  key={`${entry.dimension}-${i}`}
                  className="inline-flex items-center gap-2"
                >
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={{ background: dim?.color ?? "#94a3b8" }}
                  />
                  <span className="text-white/45">
                    第 {entry.turn} 轮 · {dim?.label ?? entry.dimension}
                  </span>
                  <span className="text-white/75">
                    「{truncateText(entry.snippet, 30)}」
                  </span>
                </span>
              );
            })}
          </div>
        </div>
      ) : null}

      <DNAStyles />
    </section>
  );
}

// ---- Identity + progress ring ----

function ProgressIdentity({
  initial,
  ratio,
  score,
  total,
}: {
  initial: string;
  ratio: number;
  score: number;
  total: number;
}) {
  const r = 50;
  const c = 2 * Math.PI * r;
  const dash = c * (1 - ratio);
  return (
    <div className="relative h-[136px] w-[136px] shrink-0">
      {/* 外光晕 */}
      <span
        className="absolute inset-[-12px] rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(124,58,237,0.45) 0%, transparent 65%)",
          animation: "lf-dna-halo 3.4s ease-in-out infinite",
        }}
      />
      <svg viewBox="0 0 120 120" className="absolute inset-0 -rotate-90">
        <defs>
          <linearGradient id="dna-progress" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#a78bfa" />
            <stop offset="50%" stopColor="#22d3ee" />
            <stop offset="100%" stopColor="#f0abfc" />
          </linearGradient>
        </defs>
        <circle cx="60" cy="60" r={r} stroke="rgba(255,255,255,0.08)" strokeWidth="6" fill="none" />
        <circle
          cx="60"
          cy="60"
          r={r}
          stroke="url(#dna-progress)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={dash}
          fill="none"
          style={{ transition: "stroke-dashoffset 800ms cubic-bezier(0.22,1,0.36,1)" }}
        />
      </svg>
      {/* 中央 avatar */}
      <div className="absolute inset-[18px] flex items-center justify-center rounded-full bg-gradient-to-br from-violet-500 via-fuchsia-500 to-cyan-400 shadow-[0_8px_30px_rgba(124,58,237,0.5)]">
        <span className="font-serif text-[42px] font-semibold text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.4)]">
          {initial}
        </span>
      </div>
      {/* 进度数字 */}
      <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-2 py-0.5 text-[10.5px] font-medium text-white backdrop-blur">
        {score}/{total} 维度
      </div>
    </div>
  );
}

// ---- Stat badge ----

function StatBadge({
  label,
  value,
  tint,
}: {
  label: string;
  value: number | string;
  tint: string;
}) {
  return (
    <span className="inline-flex items-baseline gap-1.5 rounded-full bg-white/5 px-3 py-1 backdrop-blur">
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: tint }}
      />
      <span className="font-mono text-[14px] font-semibold text-white">{value}</span>
      <span className="text-[10.5px] text-white/55">{label}</span>
    </span>
  );
}

// ---- Background ----

function DNABackground() {
  return (
    <div className="pointer-events-none absolute inset-0">
      {/* 流动渐变 */}
      <div
        className="absolute -inset-x-20 -top-32 h-[300px] blur-3xl"
        style={{
          background:
            "radial-gradient(ellipse at 20% 50%, rgba(124,58,237,0.45) 0%, transparent 60%), radial-gradient(ellipse at 80% 30%, rgba(34,211,238,0.35) 0%, transparent 50%), radial-gradient(ellipse at 60% 80%, rgba(244,63,94,0.3) 0%, transparent 55%)",
          animation: "lf-dna-drift 14s ease-in-out infinite",
        }}
      />
      {/* 细网格 */}
      <div
        className="absolute inset-0 opacity-[0.15]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage:
            "radial-gradient(ellipse at 50% 50%, black 0%, transparent 75%)",
        }}
      />
    </div>
  );
}

// ---- Styles ----

function DNAStyles() {
  return (
    <style jsx global>{`
      @keyframes lf-dna-shimmer {
        0%, 100% { opacity: 0.55; transform: translateX(-12%); }
        50% { opacity: 1; transform: translateX(12%); }
      }
      @keyframes lf-dna-halo {
        0%, 100% { opacity: 0.55; transform: scale(1); }
        50% { opacity: 0.9; transform: scale(1.06); }
      }
      @keyframes lf-dna-drift {
        0%, 100% { transform: translate(0, 0); }
        50% { transform: translate(-8%, 6%); }
      }
      @keyframes lf-dna-marquee {
        from { transform: translateX(0); }
        to { transform: translateX(-50%); }
      }
    `}</style>
  );
}

// ---- Dim color map ----

export const DIM_COLORS: Array<{ key: string; label: string; color: string }> = [
  { key: "learning_goal", label: "学习目标", color: "#a78bfa" },
  { key: "level", label: "水平", color: "#22d3ee" },
  { key: "topics", label: "主题", color: "#10b981" },
  { key: "weak_points", label: "薄弱点", color: "#f43f5e" },
  { key: "preferences", label: "偏好", color: "#f59e0b" },
  { key: "constraints", label: "约束", color: "#fb7185" },
  { key: "recent_intents", label: "意图", color: "#06b6d4" },
];

function truncateText(s: string, n: number): string {
  if (!s) return "";
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}

// ---- 408 考研倒计时 + 4门掌握度 ----

const EXAM_SUBJECTS: Array<{ key: string; label: string; color: string; max: number }> = [
  { key: "数据结构", label: "数据结构", color: "#a78bfa", max: 45 },
  { key: "计算机组成原理", label: "组原", color: "#22d3ee", max: 45 },
  { key: "操作系统", label: "OS", color: "#10b981", max: 35 },
  { key: "计算机网络", label: "网络", color: "#f59e0b", max: 25 },
];

function ExamCountdownBar({ exam }: { exam: ExamContext }) {
  const days = useMemo(() => daysUntil(exam.exam_date), [exam.exam_date]);
  const urgency =
    days === null ? "neutral" : days < 60 ? "hot" : days < 120 ? "warm" : "cool";

  const tone = {
    cool: { bg: "rgba(34,211,238,0.10)", ring: "rgba(34,211,238,0.45)", text: "#67e8f9" },
    warm: { bg: "rgba(245,158,11,0.10)", ring: "rgba(245,158,11,0.55)", text: "#fcd34d" },
    hot: { bg: "rgba(244,63,94,0.12)", ring: "rgba(244,63,94,0.65)", text: "#fda4af" },
    neutral: { bg: "rgba(255,255,255,0.06)", ring: "rgba(255,255,255,0.18)", text: "#ffffff" },
  }[urgency];

  return (
    <div
      className="relative z-10 mx-7 mt-7 flex flex-wrap items-center gap-4 rounded-2xl border px-4 py-3 backdrop-blur"
      style={{
        background: tone.bg,
        borderColor: tone.ring,
        boxShadow: `0 8px 30px -10px ${tone.ring}`,
      }}
    >
      <div className="flex items-center gap-3">
        <span
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl"
          style={{ background: `${tone.ring}` }}
        >
          <Timer size={16} className="text-white" />
        </span>
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-white/45">
            408 · {exam.target_school || "考研倒计时"}
          </p>
          <p className="font-mono text-[20px] font-semibold leading-tight" style={{ color: tone.text }}>
            {days === null ? "未设考试日" : `${days} 天`}
            {exam.exam_date ? (
              <span className="ml-2 text-[11px] font-normal text-white/55">
                · {exam.exam_date}
              </span>
            ) : null}
          </p>
        </div>
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-3">
        {EXAM_SUBJECTS.map((s) => {
          const v = exam.subject_mastery?.[s.key] ?? 0;
          const weak = exam.weak_subjects?.includes(s.key);
          return (
            <SubjectRing
              key={s.key}
              label={s.label}
              value={v}
              color={s.color}
              weak={!!weak}
            />
          );
        })}
        {exam.exam_stage ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-white/8 px-2.5 py-1 text-[10.5px] text-white/75">
            <GraduationCap size={11} />
            {exam.exam_stage} 阶段
          </span>
        ) : null}
      </div>
    </div>
  );
}

function SubjectRing({
  label,
  value,
  color,
  weak,
}: {
  label: string;
  value: number;
  color: string;
  weak: boolean;
}) {
  const pct = Math.max(0, Math.min(1, value));
  const r = 14;
  const c = 2 * Math.PI * r;
  const dash = c * (1 - pct);
  return (
    <div className="flex items-center gap-1.5">
      <div className="relative h-9 w-9">
        <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90">
          <circle cx="18" cy="18" r={r} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="3" />
          <circle
            cx="18"
            cy="18"
            r={r}
            fill="none"
            stroke={color}
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={dash}
            style={{
              filter: `drop-shadow(0 0 4px ${color})`,
              transition: "stroke-dashoffset 600ms cubic-bezier(0.22,1,0.36,1)",
            }}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center font-mono text-[10px] font-semibold text-white">
          {Math.round(pct * 100)}
        </span>
      </div>
      <span className={`text-[10.5px] ${weak ? "font-semibold text-rose-300" : "text-white/65"}`}>
        {weak ? "⚠" : ""}{label}
      </span>
    </div>
  );
}

function daysUntil(iso?: string): number | null {
  if (!iso) return null;
  const target = new Date(iso + "T00:00:00");
  if (Number.isNaN(target.getTime())) return null;
  const now = new Date();
  const ms = target.getTime() - now.getTime();
  return Math.max(0, Math.ceil(ms / 86400000));
}
