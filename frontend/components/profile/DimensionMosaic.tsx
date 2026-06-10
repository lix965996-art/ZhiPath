"use client";

import { useMemo } from "react";
import type { LearningProfile } from "@/lib/api";
import { DIM_COLORS } from "./LearnerDNAHero";

interface Props {
  profile: LearningProfile;
}

interface Dim {
  key: keyof LearningProfile;
  label: string;
  color: string;
  hint: string;
  read: (p: LearningProfile) => string[];
}

const DIMS: Dim[] = [
  {
    key: "learning_goal",
    label: "学习目标",
    color: "#a78bfa",
    hint: "你想成为什么 / 想学到什么程度",
    read: (p) => (p.learning_goal ? [p.learning_goal] : []),
  },
  {
    key: "level",
    label: "当前水平",
    color: "#22d3ee",
    hint: "初学者 / 有基础 / 进阶",
    read: (p) => (p.level ? [p.level] : []),
  },
  {
    key: "topics",
    label: "关注主题",
    color: "#10b981",
    hint: "对话中提到过的学科 / 知识点",
    read: (p) => p.topics ?? [],
  },
  {
    key: "weak_points",
    label: "薄弱点",
    color: "#f43f5e",
    hint: "你说过分不清 / 不懂 / 总是错的",
    read: (p) => p.weak_points ?? [],
  },
  {
    key: "preferences",
    label: "学习偏好",
    color: "#f59e0b",
    hint: "你喜欢的讲解风格 / 资源类型",
    read: (p) => p.preferences ?? [],
  },
  {
    key: "constraints",
    label: "约束",
    color: "#fb7185",
    hint: "时间 / 工作 / 项目截止",
    read: (p) => p.constraints ?? [],
  },
  {
    key: "recent_intents",
    label: "近期意图",
    color: "#06b6d4",
    hint: "你最近聊得多的话题方向",
    read: (p) => p.recent_intents ?? [],
  },
];

export function DimensionMosaic({ profile }: Props) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {DIMS.map((d) => (
        <DimCard key={String(d.key)} dim={d} profile={profile} />
      ))}
    </div>
  );
}

function DimCard({ dim, profile }: { dim: Dim; profile: LearningProfile }) {
  const values = dim.read(profile);
  const filled = values.length > 0;
  const evidence = useMemo(
    () =>
      (profile.evidence_log ?? []).filter((e) => e.dimension === dim.key).slice(-2),
    [profile.evidence_log, dim.key],
  );

  return (
    <section
      className="group relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 transition hover:border-[var(--primary)]"
      style={{
        boxShadow: filled
          ? `inset 0 0 0 1px ${dim.color}22, 0 14px 40px -20px ${dim.color}55`
          : undefined,
      }}
    >
      {/* 角落渐变 */}
      <div
        className="pointer-events-none absolute -top-12 -right-12 h-32 w-32 rounded-full blur-3xl transition-opacity"
        style={{
          background: `radial-gradient(circle, ${dim.color}55 0%, transparent 70%)`,
          opacity: filled ? 0.7 : 0.15,
        }}
      />

      <header className="relative flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{
              background: dim.color,
              boxShadow: `0 0 12px ${dim.color}`,
            }}
          />
          <h3 className="text-[13.5px] font-semibold text-[var(--foreground)]">
            {dim.label}
          </h3>
        </div>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-medium"
          style={{
            background: filled ? `${dim.color}1f` : "var(--muted)",
            color: filled ? dim.color : "var(--muted-foreground)",
          }}
        >
          {filled ? `${values.length} 项` : "未覆盖"}
        </span>
      </header>
      <p className="relative mt-1 text-[11px] text-[var(--muted-foreground)]">
        {dim.hint}
      </p>

      <div className="relative mt-3 min-h-[44px]">
        {filled ? (
          <div className="flex flex-wrap gap-1.5">
            {values.slice(0, 6).map((v) => (
              <span
                key={v}
                className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                style={{
                  background: `${dim.color}1a`,
                  color: dim.color,
                  border: `1px solid ${dim.color}33`,
                }}
              >
                {v}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-[11px] italic text-[var(--muted-foreground)]/70">
            尚未抽到证据，多聊几句这里就会长出来。
          </p>
        )}
      </div>

      {evidence.length > 0 ? (
        <details className="relative mt-3 group/det">
          <summary className="cursor-pointer text-[10.5px] text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
            查看原话证据 ({evidence.length})
          </summary>
          <ul className="mt-2 space-y-1.5">
            {evidence.map((e, i) => (
              <li
                key={i}
                className="rounded-lg bg-[var(--muted)] px-2 py-1.5 text-[10.5px] leading-5 text-[var(--foreground)]"
              >
                <span className="text-[var(--muted-foreground)]">
                  第 {e.turn} 轮 · {e.value}
                </span>
                <br />
                <span>「{e.snippet}」</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
