"use client";

import { useEffect, useMemo, useState } from "react";
import { getProfileEvidence, type ProfileEvidenceResponse } from "@/lib/api";
import { useChat } from "@/context/ChatContext";

const DIMENSION_LABELS: Record<string, string> = {
  learning_goal: "学习目标",
  level: "当前水平",
  topics: "关注主题",
  weak_points: "薄弱点",
  preferences: "学习偏好",
  constraints: "时间/约束",
  recent_intents: "最近意图",
};

const DIMENSION_COLORS: Record<string, string> = {
  learning_goal: "#007aff",
  level: "#5856d6",
  topics: "#34c759",
  weak_points: "#ff9500",
  preferences: "#af52de",
  constraints: "#ff2d55",
  recent_intents: "#5ac8fa",
};

const DIMENSION_ORDER = [
  "learning_goal",
  "level",
  "topics",
  "weak_points",
  "preferences",
  "constraints",
  "recent_intents",
];

interface ProfileEvidencePanelProps {
  sessionId?: string;
  compact?: boolean;
}

/**
 * "对话式画像证据链"面板：
 * - 顶部维度进度条（实时填充动画）
 * - 每个维度的 chip 后面挂"依据：第 N 轮你说……"原话片段
 * - WebSocket 的 PROFILE_UPDATE 事件实时把新维度长出来（橙色高亮 + 脉冲）
 * - 直接回应比赛"不少于 6 个维度的动态学生画像"硬指标
 */
export function ProfileEvidencePanel({ sessionId, compact = false }: ProfileEvidencePanelProps) {
  const { state } = useChat();
  const sid = sessionId ?? state.sessionId;
  const [snapshot, setSnapshot] = useState<ProfileEvidenceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 拉一次快照（包含 evidence_log + dimension_coverage）
  useEffect(() => {
    if (!sid) return;
    setLoading(true);
    setError(null);
    getProfileEvidence(sid)
      .then((data) => setSnapshot(data))
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, [sid, state.profileEvidence.length]);

  const grouped = useMemo(() => {
    const log = snapshot?.evidence_log ?? [];
    const map = new Map<string, typeof log>();
    for (const entry of log) {
      if (!map.has(entry.dimension)) map.set(entry.dimension, [] as typeof log);
      map.get(entry.dimension)!.push(entry);
    }
    return map;
  }, [snapshot]);

  /* 实时更新的维度（8秒内收到的 PROFILE_UPDATE） */
  const liveDimensions = useMemo(() => {
    const set = new Set<string>();
    for (const live of state.profileEvidence) {
      if (Date.now() - live.timestamp < 8000) {
        set.add(live.dimension);
      }
    }
    return set;
  }, [state.profileEvidence]);

  const liveValues = useMemo(() => {
    const set = new Set<string>();
    for (const live of state.profileEvidence) {
      if (Date.now() - live.timestamp < 8000) {
        set.add(`${live.dimension}:${live.value}`);
      }
    }
    return set;
  }, [state.profileEvidence]);

  const coverage = snapshot?.dimension_coverage;
  const ratio = coverage?.ratio ?? 0;
  const score = coverage?.score ?? 0;
  const total = coverage?.total ?? 7;

  return (
    <section
      className={`rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm ${
        compact ? "" : "lf-lift"
      }`}
    >
      <header className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[var(--foreground)]">🪪 画像证据链</h3>
          <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
            对话式画像 · {score} 维度 · 随学随新
          </p>
        </div>
        <CoverageRing ratio={ratio} score={score} total={total} />
      </header>

      {/* 维度进度条总览 */}
      <div className="mb-4 space-y-2">
        {DIMENSION_ORDER.map((dim) => {
          const entries = grouped.get(dim) ?? [];
          const label = DIMENSION_LABELS[dim] ?? dim;
          const color = DIMENSION_COLORS[dim] ?? "var(--primary)";
          const covered = coverage?.dimensions?.[dim];
          const isLive = liveDimensions.has(dim);
          /* 用证据数量估算"丰富度"，最多 5 条算满 */
          const fillPct = Math.min(100, (entries.length / 3) * 100);

          return (
            <div key={dim} className={`lf-dim-row ${isLive ? "lf-dim-pulse" : ""}`}>
              <div className="mb-0.5 flex items-center justify-between">
                <span className="text-[11px] font-medium text-[var(--foreground)]">{label}</span>
                <span className="text-[10px] text-[var(--muted-foreground)]">
                  {covered ? `${entries.length} 条证据` : "—"}
                </span>
              </div>
              <div className="h-[5px] overflow-hidden rounded-full bg-[var(--border)]">
                <div
                  className="lf-dim-fill h-full rounded-full transition-all duration-1000 ease-out"
                  style={{
                    width: `${fillPct}%`,
                    backgroundColor: color,
                    opacity: covered ? 1 : 0.25,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {loading && !snapshot ? (
        <p className="py-4 text-center text-xs text-[var(--muted-foreground)]">加载中…</p>
      ) : null}
      {error ? <p className="text-xs text-red-500">{error}</p> : null}

      {/* 证据详情（展开/折叠） */}
      {!compact && (
        <details className="group">
          <summary className="mb-2 cursor-pointer list-none text-[12px] font-semibold text-[var(--primary)] group-open:text-[var(--muted-foreground)]">
            查看各维度证据详情 ▾
          </summary>
          <ul className="space-y-3">
            {DIMENSION_ORDER.map((dim) => {
              const entries = grouped.get(dim) ?? [];
              const label = DIMENSION_LABELS[dim] ?? dim;
              if (entries.length === 0) return null;
              return (
                <li key={dim}>
                  <div className="mb-1 text-[11px] font-semibold text-[var(--foreground)]">{label}</div>
                  <ul className="space-y-1.5">
                    {entries.slice(-3).map((entry, idx) => {
                      const live = liveValues.has(`${entry.dimension}:${entry.value}`);
                      return (
                        <li
                          key={`${entry.value}-${idx}`}
                          className={`rounded-xl border px-3 py-2 text-xs leading-relaxed transition ${
                            live
                              ? "border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-900/20 shadow-sm ring-2 ring-orange-200 dark:ring-orange-800"
                              : "border-[var(--border)] bg-[var(--muted)]"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-[var(--foreground)]">
                              {entry.value || "（空）"}
                            </span>
                            <span className="text-[var(--muted-foreground)]">· 第 {entry.turn} 轮</span>
                            {live ? (
                              <span className="ml-auto rounded-full bg-orange-500 px-2 py-0.5 text-[10px] font-medium text-white">
                                刚刚更新
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-1 text-[var(--muted-foreground)]">
                            依据：「{entry.snippet}」
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </section>
  );
}

function CoverageRing({ ratio, score, total }: { ratio: number; score: number; total: number }) {
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - ratio);
  return (
    <div className="relative h-14 w-14 shrink-0">
      <svg viewBox="0 0 60 60" className="h-14 w-14 -rotate-90">
        <circle cx="30" cy="30" r={radius} stroke="var(--border)" strokeWidth="6" fill="none" />
        <circle
          cx="30"
          cy="30"
          r={radius}
          stroke="#0f766e"
          strokeWidth="6"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          fill="none"
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-[10px] font-medium text-[var(--foreground)]">
        <span className="text-sm leading-none">{score}/{total}</span>
        <span className="leading-none">维度</span>
      </div>
    </div>
  );
}
