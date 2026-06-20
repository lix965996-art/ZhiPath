"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
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
  defaultLearningDemoState,
  readLearningDemoState,
  type LearningDemoState,
} from "@/lib/learning-demo";
import { LearningShell } from "./LearningShell";

export function LearningProgressDashboard() {
  const [demo, setDemo] = useState<LearningDemoState>(defaultLearningDemoState);
  const [mastery, setMastery] = useState<MasterySnapshot | null>(null);
  const [due, setDue] = useState(0);

  useEffect(() => {
    setDemo(readLearningDemoState());
    listSessions()
      .then(async (sessions) => {
        if (!sessions[0]) return;
        const [masteryResult, dueResult] = await Promise.allSettled([
          getMastery(sessions[0].id),
          getDueCards(sessions[0].id, 50),
        ]);
        if (masteryResult.status === "fulfilled") setMastery(masteryResult.value);
        if (dueResult.status === "fulfilled") setDue(dueResult.value.length);
      })
      .catch(() => undefined);
  }, []);

  const avg = mastery
    ? Math.round(mastery.summary.avg_mastery * 100)
    : demo.masteryAfter;
  const weak =
    mastery?.kcs
      .filter((item) => item.mastery < 0.55)
      .sort((a, b) => a.mastery - b.mastery)
      .slice(0, 3) ?? [];

  return (
    <LearningShell>
      <header className="mb-7">
        <p className="text-sm font-semibold text-blue-600">过去 7 天</p>
        <h1 className="mt-1 text-2xl font-bold">学习诊断与进度</h1>
        <p className="mt-2 text-sm text-slate-500">
          先回答学了什么、哪里进步、哪里仍需补救，以及下一步做什么。
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric icon={BookOpenCheck} label="最近学习" value="12 个核心概念" />
        <Metric icon={ChartNoAxesCombined} label="综合掌握度" value={`${avg}%`} />
        <Metric icon={TriangleAlert} label="主要薄弱点" value="资源分配与死锁" alert />
        <Metric icon={Target} label="下一步" value="完成补救练习" />
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">掌握变化</h2>
            <span className="text-xs text-slate-500">操作系统 · 当前阶段</span>
          </div>
          <div className="mt-6 space-y-5">
            <MasteryRow label="死锁必要条件" value={78} />
            <MasteryRow label="资源分配图" value={demo.remedialPassed ? 68 : 42} />
            <MasteryRow label="银行家算法" value={demo.safeSequence.length === 5 ? 72 : 38} />
            {weak.map((item) => (
              <MasteryRow
                key={item.kc_id}
                label={item.label}
                value={Math.round(item.mastery * 100)}
              />
            ))}
          </div>
        </article>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-rose-200 bg-rose-50 p-5">
            <div className="text-xs font-semibold text-rose-600">仍需突破</div>
            <h2 className="mt-2 text-lg font-semibold">死锁预防与避免的概念边界</h2>
            <p className="mt-2 text-sm leading-6 text-rose-900">
              系统检测到你容易把“设计阶段的静态约束”和“运行时的安全检查”混淆。
            </p>
            <Link
              href="/feedback/bankers"
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
            >
              开始补救 <ArrowRight size={15} />
            </Link>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Clock3 size={17} className="text-blue-600" />
              今日复习
            </div>
            <div className="mt-3 text-3xl font-bold">{due || 3}</div>
            <div className="mt-1 text-xs text-slate-500">张到期卡片 · 约 5 分钟</div>
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
    <div className={`rounded-2xl border bg-white p-5 ${alert ? "border-rose-200" : "border-slate-200"}`}>
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
