"use client";

import { useState } from "react";
import { CheckCircle2, Sparkles } from "lucide-react";
import type { LearningResourcePackage } from "@/lib/api";
import { CodeLabCard } from "@/components/code_lab/CodeLabCard";

// ── Main View ──────────────────────────────────────────────────────

export function CodeView({ pkg, onNavigate }: { pkg: LearningResourcePackage; onNavigate: (prompt: string) => void }) {
  const codeLab = pkg.resources.code_lab;
  const snippets = codeLab?.snippets ?? [];
  const practice = codeLab?.practice_tasks;

  // Hooks must be called unconditionally (before any early return)
  const [verified, setVerified] = useState<Record<number, boolean>>({});
  const [taskDone, setTaskDone] = useState<Set<number>>(new Set());

  const toggleTask = (i: number) => {
    setTaskDone((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  };

  const handleVerify = (idx: number, passed: boolean) => {
    setVerified((prev) => ({ ...prev, [idx]: passed }));
  };

  // Early return AFTER all hooks
  if (!snippets.length) {
    return (
      <EmptyHint
        label="C 语言代码实操"
        detail="这个资源包还没有代码任务。可以补生成一份 C 语言实操，包含初始代码、TODO、检查点和参考输出。"
        action="生成 C 语言实操"
        onAction={() =>
          onNavigate(`围绕「${pkg.topic || pkg.title}」生成一份 408 风格的 C 语言代码实操。要求学生手写 C 代码，包含任务说明、初始代码、检查点和预期输出。`)
        }
      />
    );
  }

  const allPassed = snippets.length > 0 && snippets.every((_, i) => verified[i] === true);

  const allTasks = [
    ...snippets.map((s, i) => ({
      id: `snippet-${i}`,
      label: s.title || s.description || `代码片段 ${i + 1}`,
      passed: verified[i] === true,
      type: "code" as const,
    })),
    ...(practice ?? []).map((t, i) => ({
      id: `task-${i}`,
      label: typeof t === "string" ? t : (t as any).description || (t as any).title,
      passed: taskDone.has(i),
      type: "practice" as const,
    })),
  ];
  const doneCount = allTasks.filter((t) => t.passed).length;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 lf-lift">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[14px] font-bold">编程任务</h3>
          <span className="text-[11px] font-mono text-[var(--muted-foreground)]">
            {doneCount}/{allTasks.length} 完成
          </span>
        </div>

        <div className="h-2 rounded-full bg-[var(--muted)] mb-4">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600 transition-all duration-500"
            style={{ width: `${allTasks.length ? (doneCount / allTasks.length) * 100 : 0}%` }}
          />
        </div>

        <div className="space-y-1.5">
          {allTasks.map((task) => (
            <div
              key={task.id}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[12px] transition-all ${
                task.passed
                  ? "bg-emerald-50 dark:bg-emerald-950/20"
                  : "bg-[var(--muted)]/50"
              }`}
            >
              {task.passed ? (
                <CheckCircle2 size={14} className="shrink-0 text-emerald-600" />
              ) : (
                <div className="h-3.5 w-3.5 shrink-0 rounded-full border-2 border-[var(--muted-foreground)]/30" />
              )}
              <span className={task.passed ? "text-emerald-700 dark:text-emerald-400 line-through opacity-70" : ""}>
                {task.label}
              </span>
              {task.type === "code" && !task.passed && (
                <span className="ml-auto text-[9px] text-[var(--muted-foreground)]">需检查通过</span>
              )}
            </div>
          ))}
        </div>

        {allPassed && practice?.length === taskDone.size && (
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 p-3 text-[12px] font-medium text-emerald-700 dark:text-emerald-400">
            <Sparkles size={14} /> 全部完成
          </div>
        )}
      </div>

      <div onScroll={undefined}>
        <CodeLabCard codeLab={codeLab!} onVerify={handleVerify} />
      </div>

      {practice?.length ? (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 lf-lift">
          <p className="mb-3 text-[12px] font-semibold text-[var(--muted-foreground)]">拓展练习</p>
          <div className="space-y-2">
            {practice.map((t, i) => (
              <button
                key={i}
                onClick={() => toggleTask(i)}
                className={`flex w-full items-start gap-2.5 rounded-lg px-3 py-2.5 text-left text-[12px] transition-all ${
                  taskDone.has(i)
                    ? "bg-emerald-50/60 dark:bg-emerald-950/15"
                    : "hover:bg-[var(--muted)]/50"
                }`}
              >
                {taskDone.has(i) ? (
                  <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-600" />
                ) : (
                  <div className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-2 border-[var(--muted-foreground)]/30" />
                )}
                <span className={taskDone.has(i) ? "line-through opacity-60" : ""}>
                  {typeof t === "string" ? t : (t as any).description || (t as any).title}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ── EmptyHint ──────────────────────────────────────────────────────

function EmptyHint({
  label,
  detail,
  action,
  onAction,
}: {
  label?: string;
  detail?: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card-solid)] px-6 py-16 text-center shadow-[var(--shadow-soft)]">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--muted)]">
        <Sparkles size={20} className="text-[var(--muted-foreground)]" />
      </div>
      <p className="text-[14px] font-semibold text-[var(--foreground)]">
        {label ? `${label}暂未生成` : "选择上方的资源类型开始学习"}
      </p>
      {detail ? <p className="max-w-md text-[12px] leading-6 text-[var(--muted-foreground)]">{detail}</p> : null}
      {action && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-2 rounded-xl bg-[var(--foreground)] px-4 py-2 text-[12px] font-semibold text-white hover:opacity-90"
        >
          {action}
        </button>
      ) : null}
    </div>
  );
}
