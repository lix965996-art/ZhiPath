"use client";

import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  RefreshCw,
  Route,
  Sparkles,
  Target,
} from "lucide-react";
import type { QuizSubmitResult } from "@/lib/api";

interface QuizFeedbackProps {
  result: QuizSubmitResult;
}

export function QuizFeedback({ result }: QuizFeedbackProps) {
  const pct = Math.round(result.accuracy * 100);
  const barColor = pct >= 80 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-500" : "bg-red-500";
  const plan = result.remediation_plan;
  const priorityStyle = {
    high: "bg-red-50 text-red-700 border-red-200",
    medium: "bg-amber-50 text-amber-800 border-amber-200",
    low: "bg-emerald-50 text-emerald-700 border-emerald-200",
  }[plan?.priority || ""] || "bg-[var(--muted)] text-[var(--muted-foreground)] border-[var(--border)]";

  return (
    <div className="mt-3 space-y-3 rounded-[24px] border border-[var(--border)] bg-white p-4 shadow-[var(--shadow-soft)]">
      <div className="flex items-center gap-2 text-[13px] font-semibold">
        <CheckCircle2 size={16} className="text-cyan-600" />
        答题反馈
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between text-[12px]">
          <span className="text-[var(--muted-foreground)]">正确率</span>
          <span className="font-medium">{pct}%</span>
        </div>
        <div className="h-2.5 rounded-full bg-[var(--muted)]">
          <div
            className={`h-2.5 rounded-full transition-all duration-500 ${barColor}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-1 text-[11px] text-[var(--muted-foreground)]">
          {result.correct} / {result.total} 题正确
        </div>
      </div>

      {result.wrong_topics.length > 0 && (
        <div>
          <div className="mb-1.5 text-[12px] font-medium text-[var(--foreground)]">
            薄弱知识点
          </div>
          <div className="flex flex-wrap gap-1.5">
            {result.wrong_topics.map((topic) => (
              <span
                key={topic}
                className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-800"
              >
                <AlertTriangle size={10} />
                {topic}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-lg bg-gray-50 px-3 py-2 text-[12px] leading-5 text-[var(--muted-foreground)] whitespace-pre-line">
        {result.analysis}
      </div>

      {plan && (
        <div className="rounded-2xl border border-[rgba(0,122,255,0.16)] bg-[rgba(0,122,255,0.04)] p-3">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[13px] font-semibold">
              <Sparkles size={15} className="text-[var(--primary)]" />
              自适应补救计划
            </div>
            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${priorityStyle}`}>
              {plan.mastery_level}
            </span>
          </div>

          <div className="mb-3 rounded-2xl bg-white/80 px-3 py-2 text-[12px] leading-5 text-[var(--muted-foreground)]">
            <span className="font-medium text-[var(--foreground)]">策略：</span>
            {plan.strategy}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <FeedbackBlock
              icon={Target}
              title="重点补救"
              items={plan.target_topics.length ? plan.target_topics : ["当前测验主题"]}
            />
            <FeedbackBlock
              icon={AlertTriangle}
              title="错因假设"
              items={plan.error_patterns}
            />
            <FeedbackBlock
              icon={ClipboardList}
              title="下一轮任务"
              items={plan.next_tasks}
            />
            <FeedbackBlock
              icon={CheckCircle2}
              title="验收标准"
              items={plan.acceptance_criteria}
            />
          </div>

          {plan.resource_actions.length > 0 && (
            <div className="mt-3">
              <div className="mb-2 text-[12px] font-semibold">可生成的补救资源</div>
              <div className="space-y-2">
                {plan.resource_actions.map((action) => (
                  <div
                    key={`${action.type}-${action.label}`}
                    className="rounded-2xl bg-white/85 px-3 py-2 text-[12px] leading-5"
                  >
                    <div className="font-medium text-[var(--foreground)]">{action.label}</div>
                    <div className="mt-0.5 text-[var(--muted-foreground)]">{action.prompt}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {result.path_updated && (
        <div className="space-y-2 rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-[12px] text-cyan-800">
          <div className="flex items-center gap-2 font-medium">
            <RefreshCw size={14} />
            学习画像已根据答题表现更新
          </div>
          <div className="flex items-center gap-2 text-cyan-700">
            <Route size={14} />
            下一轮可直接生成针对薄弱点的补救练习，形成“测评-反馈-再生成”闭环。
          </div>
        </div>
      )}
    </div>
  );
}

function FeedbackBlock({
  icon: Icon,
  items,
  title,
}: {
  icon: typeof Target;
  items: string[];
  title: string;
}) {
  return (
    <div className="rounded-2xl bg-white/85 px-3 py-3">
      <div className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold">
        <Icon size={13} className="text-[var(--primary)]" />
        {title}
      </div>
      <div className="space-y-1.5">
        {items.map((item) => (
          <div key={item} className="flex gap-1.5 text-[11px] leading-5 text-[var(--muted-foreground)]">
            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[var(--primary)]" />
            <span>{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
