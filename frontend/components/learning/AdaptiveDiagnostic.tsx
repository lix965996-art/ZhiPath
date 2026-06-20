"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { HelpCircle } from "lucide-react";
import { writeLearningSession } from "@/lib/learning-session";
import { LearningShell } from "./LearningShell";

const questions = [
  {
    topic: "进程与线程",
    question: "同一进程中的多个线程，通常不共享下列哪一项？",
    options: ["地址空间", "打开的文件", "栈", "代码段"],
    answer: 2,
  },
  {
    topic: "死锁条件",
    question: "破坏下列哪个条件可以从机制上预防死锁？",
    options: ["互斥", "请求并保持", "不可剥夺", "以上任意一个"],
    answer: 3,
  },
  {
    topic: "资源分配图",
    question: "资源分配图中，从资源结点指向进程结点的边表示什么？",
    options: ["进程请求资源", "资源已分配给进程", "进程释放资源", "系统回收资源"],
    answer: 1,
  },
  {
    topic: "死锁计算",
    question:
      "若系统有 n 个并发进程，每个进程最多需要 m 个同类资源，为保证不发生死锁，至少需要多少个资源？",
    options: ["n × m", "n × (m - 1) + 1", "n × m + 1", "(n - 1) × m + 1"],
    answer: 1,
  },
  {
    topic: "银行家算法",
    question: "银行家算法判断系统安全性的核心依据是什么？",
    options: ["是否存在安全序列", "CPU 利用率", "进程数量", "资源总数是否为偶数"],
    answer: 0,
  },
  {
    topic: "安全序列",
    question: "判断某进程当前可否执行，应比较 Need 与哪一个向量？",
    options: ["Max", "Allocation", "Available / Work", "Finish"],
    answer: 2,
  },
  {
    topic: "死锁处理",
    question: "银行家算法属于哪一种死锁处理策略？",
    options: ["死锁预防", "死锁避免", "死锁检测", "死锁解除"],
    answer: 1,
  },
  {
    topic: "进程同步",
    question: "P 操作使信号量减 1 后小于 0，通常意味着什么？",
    options: ["进程继续执行", "进程进入等待", "资源被释放", "发生死锁"],
    answer: 1,
  },
  {
    topic: "页面置换",
    question: "Belady 异常可能出现在下列哪种算法中？",
    options: ["OPT", "LRU", "FIFO", "Clock 一定不会"],
    answer: 2,
  },
  {
    topic: "文件系统",
    question: "索引分配相较连续分配的主要优势是什么？",
    options: ["无需索引块", "支持随机访问且文件可离散存放", "不占磁盘空间", "永不产生碎片"],
    answer: 1,
  },
];

export function AdaptiveDiagnostic() {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Array<number | null>>([]);
  const [selected, setSelected] = useState<number | null>(null);

  const current = questions[index];

  const next = () => {
    const updated = [...answers, selected];
    if (index === questions.length - 1) {
      const score = updated.reduce<number>(
        (count, answer, i) => count + (answer === questions[i].answer ? 1 : 0),
        0,
      );
      writeLearningSession({
        diagnosticCompleted: true,
        diagnosticScore: score,
      });
      router.push("/today");
      return;
    }
    setAnswers(updated);
    setIndex((value) => value + 1);
    setSelected(null);
  };

  return (
    <LearningShell>
      <div>
        <section>
          <header className="mb-4">
            <p className="text-xs font-semibold text-cyan-700">基础诊断</p>
            <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-lg font-semibold">操作系统 · 基础定位</h1>
                <p className="mt-1 text-xs text-slate-500">
                  不会可以选择“不确定”，结果只按你的实际作答统计。
                </p>
              </div>
              <span className="text-sm font-semibold text-blue-600">
                {index + 1}/{questions.length}
              </span>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-600 to-cyan-400"
                style={{ width: `${((index + 1) / questions.length) * 100}%` }}
              />
            </div>
          </header>

          <article className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-xs font-semibold text-blue-600">{current.topic}</div>
            <h2 className="mt-2 text-base font-semibold leading-7">{current.question}</h2>
            <div className="mt-4 space-y-2">
              {current.options.map((option, optionIndex) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setSelected(optionIndex)}
                  className={`flex w-full items-center gap-3 rounded-lg border px-3 py-3 text-left text-sm ${
                    selected === optionIndex
                      ? "border-blue-500 bg-blue-50 text-blue-900 ring-1 ring-blue-200"
                      : "border-slate-200 hover:border-blue-200 hover:bg-slate-50"
                  }`}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-current">
                    {String.fromCharCode(65 + optionIndex)}
                  </span>
                  {option}
                </button>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600"
              >
                <HelpCircle size={15} />
                不确定
              </button>
              <button
                type="button"
                onClick={next}
                className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
              >
                {index === questions.length - 1 ? "完成诊断" : "下一题"}
              </button>
            </div>
          </article>
        </section>

      </div>
    </LearningShell>
  );
}
