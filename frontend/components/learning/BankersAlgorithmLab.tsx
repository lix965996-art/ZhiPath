"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Lightbulb,
  RefreshCcw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { writeLearningSession } from "@/lib/learning-session";
import { LearningShell } from "./LearningShell";

type Vector = [number, number, number];
interface ProcessRow {
  id: string;
  allocation: Vector;
  max: Vector;
}

const initialAvailable: Vector = [3, 3, 2];
const processes: ProcessRow[] = [
  { id: "P0", allocation: [0, 1, 0], max: [7, 5, 3] },
  { id: "P1", allocation: [2, 0, 0], max: [3, 2, 2] },
  { id: "P2", allocation: [3, 0, 2], max: [9, 0, 2] },
  { id: "P3", allocation: [2, 1, 1], max: [2, 2, 2] },
  { id: "P4", allocation: [0, 0, 2], max: [4, 3, 3] },
];

const need = (row: ProcessRow): Vector => [
  row.max[0] - row.allocation[0],
  row.max[1] - row.allocation[1],
  row.max[2] - row.allocation[2],
];

export function BankersAlgorithmLab() {
  const [available, setAvailable] = useState<Vector>(initialAvailable);
  const [sequence, setSequence] = useState<string[]>([]);
  const [mistakes, setMistakes] = useState(0);
  const [message, setMessage] = useState(
    "选择一个 Need 不超过 Available 的进程，构建一条安全序列。",
  );

  const complete = sequence.length === processes.length;
  const remaining = useMemo(
    () => processes.filter((row) => !sequence.includes(row.id)),
    [sequence],
  );

  const tryProcess = (row: ProcessRow) => {
    if (sequence.includes(row.id) || complete) return;
    const rowNeed = need(row);
    const canRun = rowNeed.every((value, i) => value <= available[i]);
    if (!canRun) {
      setMistakes((value) => value + 1);
      setMessage(
        `${row.id} 暂时不能执行：Need (${rowNeed.join(", ")}) 超过当前 Available (${available.join(", ")})。`,
      );
      writeLearningSession({ bankerAttempts: mistakes + 1 });
      return;
    }

    const nextAvailable: Vector = [
      available[0] + row.allocation[0],
      available[1] + row.allocation[1],
      available[2] + row.allocation[2],
    ];
    const nextSequence = [...sequence, row.id];
    setAvailable(nextAvailable);
    setSequence(nextSequence);
    setMessage(
      `${row.id} 可以完成，并释放 Allocation (${row.allocation.join(", ")})。Available 更新为 (${nextAvailable.join(", ")})。`,
    );
    writeLearningSession({
      bankerAttempts: mistakes,
      safeSequence: nextSequence,
    });
  };

  const reset = () => {
    setAvailable(initialAvailable);
    setSequence([]);
    setMistakes(0);
    setMessage("选择一个 Need 不超过 Available 的进程，构建一条安全序列。");
    writeLearningSession({ bankerAttempts: 0, safeSequence: [] });
  };

  return (
    <LearningShell>
      <header className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-blue-600">
              今日任务 2/3 · 互动学习
            </p>
            <h1 className="mt-1 text-lg font-semibold">银行家算法安全序列实验</h1>
          </div>
          <div className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm">
            当前步骤：构造安全序列
          </div>
        </div>
        <div className="mt-4 grid grid-cols-5 gap-2">
          {["理解概念", "查看示例", "互动操作", "验证结果", "总结巩固"].map(
            (step, index) => (
              <div key={step} className="text-center">
                <div
                  className={`h-1.5 rounded-full ${index <= 2 ? "bg-blue-600" : "bg-slate-200"}`}
                />
                <span className="mt-2 hidden text-xs text-slate-500 sm:block">
                  {step}
                </span>
              </div>
            ),
          )}
        </div>
      </header>

      <div className="grid gap-4 xl:grid-cols-[1fr_280px]">
        <section className="space-y-5">
          <article className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <div className="text-xs text-slate-500">当前可用资源 Available</div>
                <div className="mt-3 flex gap-2">
                  {available.map((value, index) => (
                    <div
                      key={index}
                      className="min-w-16 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-center"
                    >
                      <div className="text-xs text-slate-500">
                        {String.fromCharCode(65 + index)}
                      </div>
                      <div className="text-lg font-bold text-blue-700">{value}</div>
                    </div>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={reset}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600"
              >
                <RefreshCcw size={14} />
                重新开始
              </button>
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[720px] border-separate border-spacing-y-2 text-sm">
                <thead className="text-left text-xs text-slate-500">
                  <tr>
                    <th className="px-3">进程</th>
                    <th className="px-3">Allocation 已分配</th>
                    <th className="px-3">Max 最大需求</th>
                    <th className="px-3">Need 尚需</th>
                    <th className="px-3">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {processes.map((row) => {
                    const done = sequence.includes(row.id);
                    const rowNeed = need(row);
                    return (
                      <tr
                        key={row.id}
                        className={done ? "bg-emerald-50 text-emerald-900" : "bg-slate-50"}
                      >
                        <td className="rounded-l-xl px-3 py-3 font-semibold">{row.id}</td>
                        <td className="px-3 py-3 font-mono">{row.allocation.join("  ")}</td>
                        <td className="px-3 py-3 font-mono">{row.max.join("  ")}</td>
                        <td className="px-3 py-3 font-mono font-semibold">
                          {rowNeed.join("  ")}
                        </td>
                        <td className="rounded-r-xl px-3 py-3">
                          <button
                            type="button"
                            disabled={done || complete}
                            onClick={() => tryProcess(row)}
                            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                              done
                                ? "bg-emerald-100 text-emerald-700"
                                : "border border-blue-200 bg-white text-blue-700 hover:bg-blue-50"
                            }`}
                          >
                            {done ? "已完成" : "尝试执行"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </article>

          <article className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="font-semibold">你构造的安全序列</h2>
            <div className="mt-4 flex min-h-14 flex-wrap items-center gap-2">
              {sequence.length === 0 ? (
                <span className="text-sm text-slate-400">尚未选择进程</span>
              ) : (
                sequence.map((item, index) => (
                  <div key={item} className="flex items-center gap-2">
                    <span className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">
                      {item}
                    </span>
                    {index < sequence.length - 1 ? (
                      <ArrowRight size={16} className="text-slate-400" />
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </article>
        </section>

        <aside className="space-y-4">
          <section
            className={`rounded-xl border p-4 ${
              message.includes("不能")
                ? "border-rose-200 bg-rose-50"
                : complete
                  ? "border-emerald-200 bg-emerald-50"
                  : "border-blue-200 bg-blue-50"
            }`}
          >
            <div className="flex items-center gap-2 font-semibold">
              {message.includes("不能") ? (
                <XCircle size={18} className="text-rose-600" />
              ) : complete ? (
                <CheckCircle2 size={18} className="text-emerald-600" />
              ) : (
                <Lightbulb size={18} className="text-blue-600" />
              )}
              学习提示
            </div>
            <p className="mt-3 text-sm leading-6">{message}</p>
            {!complete && remaining.length > 0 ? (
              <p className="mt-3 text-xs text-slate-500">
                判断规则：Need ≤ Available 时，该进程才可能先完成。
              </p>
            ) : null}
          </section>

          {complete ? (
            <section className="rounded-xl border border-emerald-200 bg-white p-4">
              <ShieldCheck size={24} className="text-emerald-600" />
              <h2 className="mt-3 font-semibold">已找到安全序列</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                你完成了整个资源释放过程。接下来通过一道概念辨析题验证理解。
              </p>
              <Link
                href="/feedback/bankers"
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
              >
                进入验证与反馈 <ArrowRight size={15} />
              </Link>
            </section>
          ) : null}

        </aside>
      </div>
    </LearningShell>
  );
}
