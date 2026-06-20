"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  GitCompareArrows,
  TriangleAlert,
} from "lucide-react";
import { useRole } from "@/context/RoleContext";
import {
  defaultLearningDemoState,
  readLearningDemoState,
  writeLearningDemoState,
  type LearningDemoState,
} from "@/lib/learning-demo";
import { LearningShell } from "./LearningShell";

export function RemediationFeedback() {
  const { role } = useRole();
  const [demo, setDemo] = useState<LearningDemoState>(defaultLearningDemoState);
  const [selected, setSelected] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => setDemo(readLearningDemoState()), []);

  const correct = selected === 1;
  const submit = () => {
    setSubmitted(true);
    if (selected === 1) {
      const next = writeLearningDemoState({
        remedialPassed: true,
        pathAdjusted: true,
        masteryAfter: 72,
      });
      setDemo(next);
    }
  };

  return (
    <LearningShell>
      <header className="mb-6">
        <p className="text-sm font-semibold text-rose-600">学习反馈</p>
        <h1 className="mt-1 text-2xl font-bold">
          {demo.bankerAttempts > 0 ? "发现一个关键误区" : "验证你的概念理解"}
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          系统不仅记录对错，还会判断错误原因并安排补救。
        </p>
      </header>

      <div className={`grid gap-6 ${role === "showcase" ? "xl:grid-cols-[1fr_360px]" : ""}`}>
        <section className="space-y-5">
          <article className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
                <div className="text-xs font-semibold text-rose-600">常见错误判断</div>
                <p className="mt-2 text-sm">银行家算法属于死锁预防策略。</p>
              </div>
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                <div className="text-xs font-semibold text-blue-700">正确理解</div>
                <p className="mt-2 text-sm">
                  银行家算法属于死锁避免：运行时检查分配后是否仍存在安全序列。
                </p>
              </div>
            </div>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-2">
              <TriangleAlert size={19} className="text-amber-500" />
              <h2 className="font-semibold">错误诊断：概念边界混淆</h2>
            </div>
            <div className="mt-4 rounded-xl border-l-4 border-blue-600 bg-blue-50/70 p-4 text-sm leading-7">
              <p>
                <b>死锁预防</b>是在系统设计阶段强制破坏死锁产生的必要条件。
              </p>
              <p className="mt-2">
                <b>死锁避免</b>不提前禁止请求，而是在每次分配前动态检查系统是否仍处于安全状态。
                银行家算法正是通过寻找安全序列完成这项检查。
              </p>
            </div>
          </article>

          <article className="rounded-2xl border border-cyan-200 bg-cyan-50/60 p-5">
            <div className="flex items-center gap-2 font-semibold text-cyan-900">
              <GitCompareArrows size={18} />
              学习路径已动态调整
            </div>
            <p className="mt-3 text-sm leading-6 text-cyan-950">
              系统已在后续“进程通信”之前插入“死锁避免概念补救”，并提高银行家算法练习优先级。
            </p>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-blue-600">补救练习</p>
                <h2 className="mt-1 font-semibold">
                  下列哪项最准确描述死锁避免？
                </h2>
              </div>
              <span className="rounded-full bg-cyan-100 px-3 py-1 text-xs text-cyan-800">
                验证概念边界
              </span>
            </div>
            <div className="mt-5 space-y-3">
              {[
                "系统设计时破坏请求并保持条件",
                "每次资源分配前检查分配后是否仍存在安全序列",
                "发生死锁后终止部分进程",
              ].map((option, index) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    setSelected(index);
                    setSubmitted(false);
                  }}
                  className={`w-full rounded-xl border px-4 py-3 text-left text-sm ${
                    selected === index
                      ? "border-blue-500 bg-blue-50"
                      : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  {String.fromCharCode(65 + index)}. {option}
                </button>
              ))}
            </div>
            {submitted ? (
              <div
                className={`mt-4 rounded-xl p-4 text-sm ${
                  correct
                    ? "bg-emerald-50 text-emerald-800"
                    : "bg-rose-50 text-rose-800"
                }`}
              >
                {correct
                  ? "回答正确。你已经能区分静态预防与动态避免。掌握度已更新。"
                  : "还需要注意“每次分配前动态检查”这个关键词，请再比较一次上面的解释。"}
              </div>
            ) : null}
            <div className="mt-5 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                disabled={selected === null}
                onClick={submit}
                className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
              >
                提交答案
              </button>
              {submitted && correct ? (
                <Link
                  href="/path"
                  className="inline-flex items-center gap-2 rounded-lg border border-blue-200 px-5 py-2.5 text-sm font-semibold text-blue-700"
                >
                  查看调整后的路径 <ArrowRight size={15} />
                </Link>
              ) : null}
            </div>
          </article>
        </section>

        {role === "showcase" ? (
          <aside className="rounded-2xl border border-violet-200 bg-white p-5">
            <div className="font-semibold text-violet-800">演示视图 · 决策证据</div>
            <div className="mt-4 rounded-xl bg-slate-950 p-4 font-mono text-xs leading-6 text-slate-300">
              <div className="text-cyan-300">[错误诊断智能体]</div>
              <div>模式：Prevention vs Avoidance</div>
              <div>类型：概念边界混淆</div>
              <div>置信度：94%</div>
              <div className="mt-2 text-violet-300">[路径规划智能体]</div>
              <div>插入补救任务：deadlock_avoidance</div>
              <div>延后：IPC +1 节点</div>
              <div>验收：补救题通过</div>
            </div>
            <div className="mt-4 rounded-xl border border-slate-200 p-4">
              <div className="text-xs text-slate-500">掌握状态变化</div>
              <div className="mt-2 flex items-center gap-2 text-lg font-bold">
                {demo.masteryBefore}% <ArrowRight size={16} /> {demo.masteryAfter}%
              </div>
            </div>
          </aside>
        ) : null}
      </div>
    </LearningShell>
  );
}
