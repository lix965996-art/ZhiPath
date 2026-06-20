"use client";

import { useEffect, useState } from "react";
import {
  BookOpenCheck,
  ChartNoAxesCombined,
  Clock3,
  Target,
  TriangleAlert,
} from "lucide-react";
import {
  getDueCards,
  getMastery,
  listSessions,
  type MasterySnapshot,
} from "@/lib/api";
import {
  emptyLearningSession,
  readLearningSession,
  type LearningSessionState,
} from "@/lib/learning-session";
import { LearningShell } from "./LearningShell";

export function LearningProgressDashboard() {
  const [session, setSession] = useState<LearningSessionState>(emptyLearningSession);
  const [mastery, setMastery] = useState<MasterySnapshot | null>(null);
  const [due, setDue] = useState<number | null>(null);

  useEffect(() => {
    setSession(readLearningSession());
    listSessions()
      .then(async (sessions) => {
        if (!sessions[0]) return;
        const [masteryResult, dueResult] = await Promise.allSettled([
          getMastery(sessions[0].id),
          getDueCards(sessions[0].id, 50),
        ]);
        if (
          masteryResult.status === "fulfilled" &&
          masteryResult.value.kcs.some((item) => item.attempts > 0)
        ) {
          setMastery(masteryResult.value);
        }
        if (dueResult.status === "fulfilled") setDue(dueResult.value.length);
      })
      .catch(() => undefined);
  }, []);

  const avg = mastery ? Math.round(mastery.summary.avg_mastery * 100) : null;
  const weak =
    mastery?.kcs
      .filter((item) => item.attempts > 0 && item.mastery < 0.55)
      .sort((a, b) => a.mastery - b.mastery)
      .slice(0, 3) ?? [];

  return (
    <LearningShell>
      <header className="mb-4 border-b border-slate-200 pb-4">
        <p className="text-xs font-semibold text-blue-600">过去 7 天</p>
        <h1 className="mt-1 text-lg font-semibold">学习诊断与进度</h1>
        <p className="mt-1 text-xs text-slate-500">
          先回答学了什么、哪里进步、哪里仍需补救，以及下一步做什么。
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric
          icon={BookOpenCheck}
          label="已完成步骤"
          value={`${Number(session.diagnosticCompleted) + Number(session.safeSequence.length === 5) + Number(session.remedialCorrect)}/3`}
        />
        <Metric
          icon={ChartNoAxesCombined}
          label="后端掌握度"
          value={avg === null ? "暂无记录" : `${avg}%`}
        />
        <Metric
          icon={TriangleAlert}
          label="后端薄弱点"
          value={weak[0]?.label ?? "暂无记录"}
          alert={weak.length > 0}
        />
        <Metric
          icon={Target}
          label="当前步骤"
          value={
            !session.diagnosticCompleted
              ? "完成基础诊断"
              : session.safeSequence.length !== 5
                ? "完成安全序列"
                : session.remedialCorrect
                  ? "本单元已完成"
                  : "完成辨析练习"
          }
        />
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <article className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">掌握变化</h2>
            <span className="text-xs text-slate-500">操作系统 · 当前阶段</span>
          </div>
          <div className="mt-4 space-y-4">
            {mastery ? mastery.kcs.filter((item) => item.attempts > 0).map((item) => (
              <MasteryRow
                key={item.kc_id}
                label={item.label}
                value={Math.round(item.mastery * 100)}
              />
            )) : (
              <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">
                暂无后端掌握度记录。完成系统中的正式测验后，这里才会显示数据。
              </p>
            )}
          </div>
        </article>

        <aside className="space-y-4">
          {weak[0] ? (
            <section className="rounded-xl border border-rose-200 bg-rose-50 p-4">
              <div className="text-xs font-semibold text-rose-600">当前最低掌握项</div>
              <h2 className="mt-2 text-lg font-semibold">{weak[0].label}</h2>
              <p className="mt-2 text-sm leading-6 text-rose-900">
                后端记录掌握度为 {Math.round(weak[0].mastery * 100)}%。
              </p>
            </section>
          ) : null}

          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Clock3 size={17} className="text-blue-600" />
              今日复习
            </div>
            <div className="mt-2 text-xl font-bold">{due === null ? "—" : due}</div>
            <div className="mt-1 text-xs text-slate-500">
              {due === null ? "尚未读取到复习记录" : "张真实到期卡片"}
            </div>
          </section>
        </aside>
      </section>
    </LearningShell>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  alert = false,
}: {
  icon: typeof Target;
  label: string;
  value: string;
  alert?: boolean;
}) {
  return (
    <div className={`rounded-xl border bg-white p-4 ${alert ? "border-rose-200" : "border-slate-200"}`}>
      <Icon size={18} className={alert ? "text-rose-600" : "text-blue-600"} />
      <div className="mt-4 text-xs text-slate-500">{label}</div>
      <div className={`mt-1 text-lg font-bold ${alert ? "text-rose-700" : ""}`}>{value}</div>
    </div>
  );
}

function MasteryRow({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-slate-500">{value}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full ${
            value >= 70 ? "bg-emerald-500" : value >= 50 ? "bg-blue-500" : "bg-amber-500"
          }`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}
