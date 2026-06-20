"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  GitCompareArrows,
  Wrench,
} from "lucide-react";
import {
  defaultLearningDemoState,
  readLearningDemoState,
  type LearningDemoState,
} from "@/lib/learning-demo";
import { LearningShell } from "./LearningShell";

export function AdaptivePathView() {
  const [demo, setDemo] = useState<LearningDemoState>(defaultLearningDemoState);
  useEffect(() => setDemo(readLearningDemoState()), []);

  const adjusted = demo.pathAdjusted || demo.remedialPassed;

  return (
    <LearningShell>
      <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-blue-600">操作系统 · 当前阶段</p>
          <h1 className="mt-1 text-2xl font-bold">学习路径</h1>
          <p className="mt-2 text-sm text-slate-500">
            路径不是固定课程表，会根据诊断和练习结果持续调整。
          </p>
        </div>
        <Link
          href="/learn/bankers"
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white"
        >
          继续当前任务 <ArrowRight size={15} />
        </Link>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <PathColumn
            title="原学习计划"
            muted={adjusted}
            items={[
              { title: "死锁条件", state: "done" },
              { title: "进程通信 IPC", state: "current" },
              { title: "银行家算法", state: "pending" },
            ]}
          />
          <PathColumn
            title={adjusted ? "优化后路径" : "当前路径"}
            items={[
              { title: "死锁条件", state: "done" },
              ...(adjusted
                ? [
                    {
                      title: "补救练习：资源分配图",
                      state: demo.remedialPassed ? ("done" as const) : ("current" as const),
                    },
                  ]
                : []),
              {
                title: "银行家算法",
                state: adjusted && demo.remedialPassed ? "current" : "pending",
              },
              { title: "进程通信 IPC", state: "pending" },
            ]}
          />
        </div>
      </section>

      <section className="mt-5 rounded-2xl border border-cyan-200 bg-cyan-50/70 p-5">
        <div className="flex items-center gap-2 font-semibold text-cyan-900">
          <GitCompareArrows size={18} />
          {adjusted ? "为什么发生调整" : "什么时候会调整"}
        </div>
        <p className="mt-3 max-w-4xl text-sm leading-7 text-cyan-950">
          {adjusted
            ? "你在资源分配与死锁策略辨析中暴露出概念混淆。系统先插入补救练习，再提前银行家算法，避免带着错误基础进入后续内容。"
            : "完成互动学习和补救题后，系统会根据错误类型、掌握变化和复习结果重新排列后续任务。"}
        </p>
        {adjusted ? (
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-white px-3 py-1.5 text-cyan-800">
              触发：概念边界混淆
            </span>
            <span className="rounded-full bg-white px-3 py-1.5 text-cyan-800">
              新增：1 个补救任务
            </span>
            <span className="rounded-full bg-white px-3 py-1.5 text-cyan-800">
              掌握度：{demo.masteryBefore}% → {demo.masteryAfter}%
            </span>
          </div>
        ) : null}
      </section>
    </LearningShell>
  );
}

function PathColumn({
  title,
  items,
  muted = false,
}: {
  title: string;
  items: Array<{ title: string; state: "done" | "current" | "pending" }>;
  muted?: boolean;
}) {
  return (
    <div className={muted ? "opacity-55" : ""}>
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
