"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, GraduationCap, Users } from "lucide-react";
import { apiUrl, getClassroomOverview, type ClassroomOverview } from "@/lib/api";
import { EmptyStateGuide } from "@/components/ui/EmptyStateGuide";

export default function ClassroomPage() {
  const [data, setData] = useState<ClassroomOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<"avg_mastery" | "due_count" | "turn_count">("avg_mastery");

  useEffect(() => {
    getClassroomOverview()
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  const students = data
    ? [...data.students].sort((a, b) => {
        if (sortKey === "avg_mastery") return a.avg_mastery - b.avg_mastery;
        if (sortKey === "due_count") return b.due_count - a.due_count;
        return b.turn_count - a.turn_count;
      })
    : [];

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <GraduationCap size={22} className="text-emerald-600" />
            <div>
              <h1 className="text-lg font-semibold text-slate-900">教师班级视图</h1>
              <p className="text-xs text-slate-500">
                聚合所有学习会话 · BKT 掌握度 + FSRS 复习量 · 班级薄弱 TOP
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={apiUrl("/api/v1/classroom/export.csv")}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
            >
              <Download size={14} />
              导出 CSV
            </a>
            <a
              href={apiUrl("/api/v1/classroom/export.json")}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
            >
              <Download size={14} />
              导出 JSON
            </a>
            <Link
              href="/chat"
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
            >
              <ArrowLeft size={14} />
              返回学习工作台
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-5 px-4 py-6">
        {loading ? (
          <p className="py-12 text-center text-sm text-slate-400">加载中…</p>
        ) : !data || data.student_count === 0 ? (
          <EmptyStateGuide
            title="尚无学生数据"
            hint="班级视图需要至少 1 个会话才能聚合。最快的方式是点下方一键填充演示数据。"
          />
        ) : (
          <>
            <section className="grid gap-3 sm:grid-cols-3">
              <Stat label="学生数" value={data.student_count} icon={Users} />
              <Stat
                label="班级平均掌握度"
                value={`${(data.aggregate.avg_mastery * 100).toFixed(0)}%`}
                icon={GraduationCap}
              />
              <Stat
                label="待复习卡片总数"
                value={data.aggregate.review_due_total}
                icon={GraduationCap}
              />
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <header className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">班级薄弱知识点 TOP 10</h3>
                <span className="text-xs text-slate-500">出现次数 = 多少个学生在该 KC 上掌握度 &lt; 50%</span>
              </header>
              <div className="flex flex-wrap gap-2">
                {data.aggregate.top_weak_kcs.map((k) => (
                  <span
                    key={k.label}
                    className="rounded-full bg-rose-50 px-3 py-1 text-xs text-rose-700"
                  >
                    {k.label} <span className="ml-1 text-rose-500">×{k.count}</span>
                  </span>
                ))}
                {data.aggregate.top_weak_kcs.length === 0 ? (
                  <span className="text-xs text-slate-400">暂无薄弱点</span>
                ) : null}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <header className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">学生列表</h3>
                <div className="flex gap-1">
                  {(["avg_mastery", "due_count", "turn_count"] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setSortKey(k)}
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition ${
                        sortKey === k
                          ? "bg-slate-900 text-white"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {k === "avg_mastery" ? "薄弱优先" : k === "due_count" ? "待复习多" : "活跃度"}
                    </button>
                  ))}
                </div>
              </header>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="text-left text-slate-500">
                      <th className="px-2 py-1">学生</th>
                      <th className="px-2 py-1">目标</th>
                      <th className="px-2 py-1">轮次</th>
                      <th className="px-2 py-1">平均掌握度</th>
                      <th className="px-2 py-1">薄弱 KC</th>
                      <th className="px-2 py-1">已巩固</th>
                      <th className="px-2 py-1">待复习</th>
                      <th className="px-2 py-1">薄弱知识点</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((s) => (
                      <tr key={s.session_id} className="border-t border-slate-100">
                        <td className="px-2 py-1 font-medium text-slate-800">{s.title}</td>
                        <td className="px-2 py-1 max-w-[200px] truncate text-slate-600">
                          {s.learning_goal}
                        </td>
                        <td className="px-2 py-1 text-slate-600">{s.turn_count}</td>
                        <td className="px-2 py-1">
                          <MasteryBar value={s.avg_mastery} />
                        </td>
                        <td className="px-2 py-1 text-rose-600">{s.weak_count}</td>
                        <td className="px-2 py-1 text-emerald-600">{s.mature_count}</td>
                        <td className="px-2 py-1 text-blue-600">{s.due_count}</td>
                        <td className="px-2 py-1 max-w-[180px] truncate text-slate-500">
                          {s.weak_top.slice(0, 3).join(" · ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function Stat({ label, value, icon: Icon }: { label: string; value: number | string; icon: typeof Users }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <Icon size={18} className="text-slate-400" />
      <div className="mt-1 text-2xl font-bold text-slate-900">{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}

function MasteryBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = value < 0.4 ? "#ef4444" : value < 0.7 ? "#f59e0b" : "#10b981";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="font-mono text-[11px] text-slate-700">{pct}%</span>
    </div>
  );
}
