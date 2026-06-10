"use client";

import type { LearningProfile, ProfileEvidenceEntry } from "@/lib/api";
import { DIM_COLORS } from "./LearnerDNAHero";
import { Clock3 } from "lucide-react";

interface Props {
  profile: LearningProfile;
}

/**
 * 证据时间线：按"轮次"分组（最近 5 轮），展示每轮抽到了哪些画像维度。
 * 视觉上像聊天回放，强调"画像随学随新"。
 */
export function EvidenceTimeline({ profile }: Props) {
  const log = profile.evidence_log ?? [];
  if (log.length === 0) {
    return (
      <section className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)] p-8 text-center">
        <Clock3
          size={20}
          className="mx-auto mb-2 text-[var(--muted-foreground)]"
        />
        <p className="text-[12px] text-[var(--muted-foreground)]">
          尚无对话证据。每轮对话都会在这里留下一条画像更新记录。
        </p>
      </section>
    );
  }

  // 按 turn 分组
  const byTurn = new Map<number, ProfileEvidenceEntry[]>();
  for (const e of log) {
    const arr = byTurn.get(e.turn) ?? [];
    arr.push(e);
    byTurn.set(e.turn, arr);
  }
  const turns = [...byTurn.entries()].sort((a, b) => b[0] - a[0]).slice(0, 6);

  return (
    <section className="relative rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-[14px] font-semibold text-[var(--foreground)]">
            画像演化时间线
          </h3>
          <p className="mt-0.5 text-[11px] text-[var(--muted-foreground)]">
            最近 {turns.length} 轮对话抽到的新维度。证明画像真在跟着你学。
          </p>
        </div>
        <span className="rounded-full bg-[var(--muted)] px-2.5 py-0.5 text-[10.5px] text-[var(--muted-foreground)]">
          {log.length} 条证据
        </span>
      </header>

      <ol className="relative space-y-4 pl-5">
        {/* 时间轴 */}
        <span
          className="absolute left-[5px] top-1 bottom-1 w-[2px] rounded-full"
          style={{
            background:
              "linear-gradient(180deg, #a78bfa 0%, #22d3ee 50%, #f43f5e 100%)",
          }}
        />

        {turns.map(([turn, entries]) => (
          <li key={turn} className="relative">
            <span
              className="absolute -left-[1px] top-1.5 inline-block h-3 w-3 rounded-full ring-2 ring-[var(--card)]"
              style={{
                background:
                  DIM_COLORS.find((d) => d.key === entries[0].dimension)?.color ??
                  "#94a3b8",
                boxShadow: "0 0 12px rgba(124,58,237,0.55)",
              }}
            />
            <div className="ml-3">
              <p className="mb-1.5 text-[11.5px] font-medium text-[var(--muted-foreground)]">
                第 {turn} 轮 · 抽到 {entries.length} 个维度
              </p>
              <div className="flex flex-wrap gap-1.5">
                {entries.map((e, i) => {
                  const dim = DIM_COLORS.find((d) => d.key === e.dimension);
                  return (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px]"
                      style={{
                        background: `${dim?.color ?? "#94a3b8"}1a`,
                        color: dim?.color ?? "#64748b",
                        border: `1px solid ${dim?.color ?? "#cbd5e1"}33`,
                      }}
                      title={e.snippet}
                    >
                      <span className="font-medium">{dim?.label}</span>
                      <span className="opacity-80">{e.value}</span>
                    </span>
                  );
                })}
              </div>
              <p
                className="mt-1.5 truncate text-[10.5px] italic text-[var(--muted-foreground)]"
                title={entries[0].snippet}
              >
                「{entries[0].snippet}」
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
