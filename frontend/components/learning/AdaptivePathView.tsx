"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  Wrench,
} from "lucide-react";
import {
  emptyLearningSession,
  readLearningSession,
  type LearningSessionState,
} from "@/lib/learning-session";
import { LearningShell } from "./LearningShell";

export function AdaptivePathView() {
  const [session, setSession] = useState<LearningSessionState>(emptyLearningSession);
  useEffect(() => setSession(readLearningSession()), []);

  return (
    <LearningShell>
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <p className="text-sm font-semibold text-blue-600">操作系统 · 当前阶段</p>
          <h1 className="mt-1 text-lg font-semibold">学习路径</h1>
          <p className="mt-1 text-xs text-slate-500">
            这里只显示已完成和可继续的真实学习步骤。
          </p>
        </div>
        <Link
          href="/learn/bankers"
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white"
        >
          继续当前任务 <ArrowRight size={15} />
        </Link>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div>
          <PathColumn
            title="当前学习顺序"
            items={[
              {
                title: "操作系统基础诊断",
                state: session.diagnosticCompleted ? "done" : "current",
              },
              {
                title: "银行家算法安全序列实验",
                state:
                  session.safeSequence.length === 5
                    ? "done"
                    : session.diagnosticCompleted
                      ? "current"
                      : "pending",
              },
              {
                title: "死锁策略辨析练习",
                state: session.remedialCorrect
                  ? "done"
                  : session.safeSequence.length === 5
                    ? "current"
                    : "pending",
              },
            ]}
          />
        </div>
      </section>
    </LearningShell>
  );
}

function PathColumn({
  title,
  items,
}: {
  title: string;
  items: Array<{ title: string; state: "done" | "current" | "pending" }>;
}) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-slate-600">{title}</h2>
      <div className="mt-4 space-y-3">
        {items.map((item, index) => (
          <div
            key={`${item.title}-${index}`}
            className={`flex items-center gap-3 rounded-xl border p-4 ${
              item.state === "current"
                ? "border-blue-400 bg-blue-50"
                : "border-slate-200 bg-slate-50"
            }`}
          >
            {item.state === "done" ? (
              <CheckCircle2 size={19} className="text-emerald-600" />
            ) : item.state === "current" ? (
              <Wrench size={19} className="text-blue-600" />
            ) : (
              <Circle size={19} className="text-slate-300" />
            )}
            <div className="font-medium">{item.title}</div>
            {item.state === "current" ? (
              <span className="ml-auto rounded-full bg-blue-600 px-2.5 py-1 text-xs text-white">
                当前
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
