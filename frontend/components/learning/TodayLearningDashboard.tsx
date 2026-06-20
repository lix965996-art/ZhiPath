"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Clock3,
  Target,
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

export function TodayLearningDashboard() {
  const [session, setSession] = useState<LearningSessionState>(emptyLearningSession);
  const [mastery, setMastery] = useState<MasterySnapshot | null>(null);
  const [dueCount, setDueCount] = useState<number | null>(null);

  useEffect(() => {
    setSession(readLearningSession());
    listSessions()
      .then(async (sessions) => {
        if (!sessions[0]) return;
        const [masteryData, cards] = await Promise.allSettled([
          getMastery(sessions[0].id),
          getDueCards(sessions[0].id, 50),
        ]);
        if (
          masteryData.status === "fulfilled" &&
          masteryData.value.kcs.some((item) => item.attempts > 0)
        ) {
          setMastery(masteryData.value);
        }
        if (cards.status === "fulfilled") {
          setDueCount(cards.value.length);
        }
      })
      .catch(() => undefined);
  }, []);

  const weak = mastery?.kcs
    .filter((item) => item.attempts > 0 && item.mastery < 0.55)
    .sort((a, b) => a.mastery - b.mastery)[0];
  const completed =
    Number(session.diagnosticCompleted) +
    Number(session.safeSequence.length === 5) +
    Number(session.remedialCorrect);

  return (
    <LearningShell>
      <section className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">今日学习</h1>
          <p className="mt-1 text-xs text-slate-500">
            3 项任务 · 预计 28 分钟
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
          今日进度 <b className="ml-2 text-blue-600">{completed}/3</b>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
        <section className="space-y-3">
          <TaskCard
            index={1}
            label="基础检查"
            title="操作系统诊断"
            detail="10 道题 · 预计 8 分钟"
            reason={
              session.diagnosticCompleted
                ? `已完成，答对 ${session.diagnosticScore ?? 0}/10。`
                : "先记录当前基础，后续学习结果才能有可比较的起点。"
            }
            status={session.diagnosticCompleted ? "completed" : "active"}
            href="/diagnostic"
          />
          <TaskCard
            index={2}
            label="重点学习"
            title="银行家算法与安全序列"
            detail="互动矩阵 · 预计 15 分钟"
            reason={
              weak
                ? `真实掌握度记录中，「${weak.label}」当前为 ${Math.round(weak.mastery * 100)}%。`
                : "通过实际资源矩阵操作理解安全序列，不依赖文字背诵。"
            }
            status={session.safeSequence.length === 5 ? "completed" : session.diagnosticCompleted ? "active" : "pending"}
            href="/learn/bankers"
          />
          <TaskCard
            index={3}
            label="针对性练习"
            title="死锁预防与死锁避免"
            detail="1 道概念辨析题 · 预计 5 分钟"
            reason="完成互动学习后，用相似但不重复的题目验证是否真正掌握。"
            status={session.remedialCorrect ? "completed" : session.safeSequence.length === 5 ? "active" : "pending"}
            href="/feedback/bankers"
          />
        </section>

        <aside className="space-y-3">
          <section className="grid grid-cols-2 gap-3">
            <Metric
              icon={Target}
              value={
                mastery
                  ? `${Math.round(mastery.summary.avg_mastery * 100)}%`
                  : "暂无"
              }
              label="真实掌握记录"
            />
            <Metric icon={Clock3} value="28 分钟" label="任务预计" />
          </section>

          <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-500">
            {dueCount === null
              ? "尚未读取到复习记录。"
              : dueCount > 0
                ? `今天有 ${dueCount} 张真实到期卡片。`
                : "今天没有到期复习卡片。"}
          </div>
        </aside>
      </div>
    </LearningShell>
  );
}

function TaskCard({
  index,
  label,
  title,
  detail,
  reason,
  status,
  href,
}: {
  index: number;
  label: string;
  title: string;
  detail: string;
  reason: string;
  status: "completed" | "active" | "pending";
  href: string;
}) {
  const active = status === "active";
  return (
    <article
      className={`rounded-xl border bg-white px-4 py-3.5 ${
        active
          ? "border-blue-400 shadow-[0_12px_30px_rgba(37,99,235,0.10)] ring-1 ring-blue-100"
          : "border-slate-200"
      }`}
    >
      <div className="flex gap-4">
        <div
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
            status === "completed"
              ? "bg-emerald-100 text-emerald-700"
              : active
                ? "bg-blue-600 text-white"
                : "bg-slate-100 text-slate-500"
          }`}
        >
          {status === "completed" ? "✓" : index}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-blue-600">{label}</span>
            <span className="text-xs text-slate-400">{detail}</span>
          </div>
          <h2 className="mt-1 text-base font-semibold">{title}</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">{reason}</p>
          <Link
            href={href}
            className={`mt-3 inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold ${
              active
                ? "bg-blue-600 text-white hover:bg-blue-700"
                : "border border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {active ? "开始学习" : status === "completed" ? "查看记录" : "查看任务"}
            <ArrowRight size={15} />
          </Link>
        </div>
      </div>
    </article>
  );
}

function Metric({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof Target;
  value: string;
  label: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <Icon size={17} className="text-blue-600" />
      <div className="mt-2 text-lg font-bold">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{label}</div>
    </div>
  );
}
