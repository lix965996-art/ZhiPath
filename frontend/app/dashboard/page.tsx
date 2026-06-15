"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BarChart3, Brain, Calendar, Network } from "lucide-react";
import {
  getKGSuggestions,
  getKnowledgeGraph,
  getMastery,
  getReviewCalendar,
  listSessions,
  type KGSuggestion,
  type KnowledgeGraphData,
  type MasterySnapshot,
  type ReviewCalendar,
  type SessionSummary,
} from "@/lib/api";
import { MasteryHeatmap } from "@/components/dashboard/MasteryHeatmap";
import { ReviewCalendarView } from "@/components/dashboard/ReviewCalendarView";
import { KnowledgeGraphView } from "@/components/kg/KnowledgeGraphView";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { EmptyStateGuide } from "@/components/ui/EmptyStateGuide";

/**
 * 学生「我的学习分析」页 — 原 Dashboard 改造。
 * 只展示当前学生自己的知识图谱、掌握度热力图、FSRS 复习日历。
 */
export default function AnalyticsPage() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [activeSession, setActiveSession] = useState<string>("");
  const [mastery, setMastery] = useState<MasterySnapshot | null>(null);
  const [calendar, setCalendar] = useState<ReviewCalendar | null>(null);
  const [kg, setKg] = useState<KnowledgeGraphData>({ nodes: [], edges: [] });
  const [suggestions, setSuggestions] = useState<KGSuggestion[]>([]);

  useEffect(() => {
    listSessions()
      .then((data) => {
        setSessions(data);
        if (!activeSession && data[0]) setActiveSession(data[0].id);
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!activeSession) return;
    getMastery(activeSession).then(setMastery).catch(() => setMastery(null));
    getReviewCalendar(activeSession).then(setCalendar).catch(() => setCalendar(null));
    getKnowledgeGraph(activeSession).then(setKg).catch(() => setKg({ nodes: [], edges: [] }));
    getKGSuggestions(activeSession).then(setSuggestions).catch(() => setSuggestions([]));
  }, [activeSession]);

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <BarChart3 size={22} className="text-blue-600" />
            <div>
              <h1 className="text-lg font-semibold text-slate-900">我的学习分析</h1>
              <p className="text-xs text-slate-500">
                知识图谱 · 掌握度热力图 · FSRS 复习日历
              </p>
            </div>
          </div>
          <Link
            href="/chat"
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
          >
            <ArrowLeft size={14} />
            返回学习工作台
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        {sessions.length === 0 ? (
          <EmptyStateGuide
            title="尚无会话数据"
            hint="学习分析需要至少 1 个会话才能展示。最快的方式是点下方一键填充演示数据。"
          />
        ) : (
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">会话选择</h2>
              <span className="text-xs text-slate-500">共 {sessions.length} 个会话</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {sessions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setActiveSession(s.id)}
                  className={`rounded-full border px-3 py-1 text-xs transition ${
                    activeSession === s.id
                      ? "border-blue-400 bg-blue-50 text-blue-700"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {s.title || s.id.slice(0, 8)}
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <Card title="我的知识图谱（前后置依赖）" icon={Network}>
            <KnowledgeGraphView graph={kg} mastery={mastery?.kcs ?? []} />
            {suggestions.length > 0 ? (
              <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-xs">
                <p className="mb-1 font-semibold text-emerald-800">
                  📌 系统建议下一步学习
                </p>
                <ol className="list-inside list-decimal space-y-0.5 text-emerald-900">
                  {suggestions.map((s) => (
                    <li key={s.node.id}>
                      {s.node.label}
                      <span className="ml-1 text-emerald-700">
                        （当前 {(s.current_mastery * 100).toFixed(0)}% · 难度{" "}
                        {(s.node.difficulty * 100).toFixed(0)}%）
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
          </Card>

          <Card title="知识点掌握度热力图" icon={Brain}>
            {mastery ? <MasteryHeatmap kcs={mastery.kcs} /> : <Empty />}
            {mastery ? (
              <p className="mt-2 text-[11px] text-slate-500">
                共 {mastery.summary.count} 个知识点 · 平均掌握度{" "}
                {(mastery.summary.avg_mastery * 100).toFixed(0)}% · 薄弱{" "}
                {mastery.summary.weak} · 已成熟 {mastery.summary.mature}
              </p>
            ) : null}
          </Card>
          <Card title="复习日历 (FSRS-4)" icon={Calendar}>
            {calendar ? <ReviewCalendarView calendar={calendar} /> : <Empty />}
          </Card>
        </section>
      </div>
    </main>
  );
}

function Card({
  children,
  title,
  icon: Icon,
}: {
  children: React.ReactNode;
  title: string;
  icon: typeof BarChart3;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <header className="mb-3 flex items-center gap-2">
        <Icon size={16} className="text-blue-600" />
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      </header>
      <ErrorBoundary scope="card">{children}</ErrorBoundary>
    </section>
  );
}

function Empty() {
  return (
    <div className="py-6 text-center text-xs text-slate-400">
      暂无数据。先在主界面完成一轮交互。
    </div>
  );
}
