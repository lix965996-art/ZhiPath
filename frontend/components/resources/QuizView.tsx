"use client";

import { useMemo, useState } from "react";
import type { LearningResourcePackage } from "@/lib/api";

// ── Types ──────────────────────────────────────────────────────────

interface QuizQ {
  question: string;
  options?: string[];
  correct_option?: number | number[] | string;
  correct_answer?: boolean;
  explanation?: string;
  _type: "single_choice" | "multiple_choice" | "true_false" | "short_answer";
}

function cleanExplanation(text?: string) {
  if (!text) return "";
  return text
    .replace(/^\s*(根据|依据|结合)?(课程)?(文档|资料|材料|知识库|学习文档|参考资料)(中)?(明确)?(指出|显示|说明|提到|给出|表明)[，,:：\s]*/g, "")
    .replace(/^\s*(从|由)(课程)?(文档|资料|材料|知识库|学习文档|参考资料)(可知|可以看出)[，,:：\s]*/g, "")
    .replace(/^\s*(本题)?(依据|根据)(课程)?(文档|资料|材料|知识库|学习文档|参考资料)[，,:：\s]*/g, "")
    .replace(/\s*(本题)?(来源于|来自)(课程)?(文档|资料|材料|知识库|学习文档|参考资料)[。；;，,]*\s*/g, "")
    .trim();
}

// ── Main View ──────────────────────────────────────────────────────

export function QuizView({ pkg }: { pkg: LearningResourcePackage }) {
  const data = pkg.resources.quiz?.data;

  const questions = useMemo(() => {
    const qs: QuizQ[] = [];
    for (const q of data?.single_choice_questions ?? []) {
      qs.push({ ...q, _type: "single_choice" });
    }
    for (const q of data?.multiple_choice_questions ?? []) {
      qs.push({ ...q, _type: "multiple_choice" });
    }
    for (const q of data?.true_false_questions ?? []) {
      qs.push({ ...q, _type: "true_false" });
    }
    for (const q of data?.short_answer_questions ?? []) {
      qs.push({ ...q, _type: "short_answer" });
    }
    return qs;
  }, [data]);

  // Hooks must be called unconditionally (before any early return)
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selected, setSelected] = useState<number | boolean | number[] | string | null>(null);
  const [answered, setAnswered] = useState(false);
  const [results, setResults] = useState<{ correct: boolean }[]>([]);
  const [showSummary, setShowSummary] = useState(false);

  // Early return AFTER all hooks
  if (!questions.length) return <EmptyHint label="习题" />;

  const q = questions[currentIdx];
  const total = questions.length;
  const explanation = cleanExplanation(q.explanation);

  if (showSummary) {
    const correctCount = results.filter((r) => r.correct).length;
    const pct = Math.round((correctCount / total) * 100);
    return (
      <div className="mx-auto max-w-lg py-8">
        <div className="mb-8 text-center">
          <div className={`mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full ${
            pct >= 80 ? "bg-emerald-100 dark:bg-emerald-900/30" : pct >= 60 ? "bg-amber-100 dark:bg-amber-900/30" : "bg-red-100 dark:bg-red-900/30"
          }`}>
            <span className={`text-[28px] font-bold ${pct >= 80 ? "text-emerald-600" : pct >= 60 ? "text-amber-600" : "text-red-600"}`}>
              {pct}%
            </span>
          </div>
          <h3 className="text-[18px] font-bold">答题完成</h3>
          <p className="mt-1 text-[13px] text-[var(--muted-foreground)]">
            {correctCount}/{total} 题正确
          </p>
        </div>
        <div className="space-y-2">
          {results.map((r, i) => (
            <div key={i} className={`flex items-center gap-3 rounded-lg border px-4 py-2.5 text-[13px] ${
              r.correct ? "border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20" : "border-red-200 bg-red-50 dark:bg-red-950/20"
            }`}>
              <span className="font-mono text-[11px] text-[var(--muted-foreground)]">Q{i + 1}</span>
              <span className="flex-1 truncate">{questions[i].question}</span>
              <span className={r.correct ? "text-emerald-600 font-medium" : "text-red-500 font-medium"}>
                {r.correct ? "✓" : "✗"}
              </span>
            </div>
          ))}
        </div>
        <button
          onClick={() => { setCurrentIdx(0); setSelected(null); setAnswered(false); setResults([]); setShowSummary(false); }}
          className="mt-6 w-full rounded-xl bg-[var(--foreground)] py-3 text-[13px] font-medium text-white hover:opacity-90 transition"
        >
          重新答题
        </button>
      </div>
    );
  }

  const handleSelect = (val: number | boolean | number[] | string) => {
    if (answered) return;
    setSelected(val);
  };

  const toggleMultiOption = (idx: number) => {
    if (answered) return;
    const current = Array.isArray(selected) ? [...selected] : [];
    const pos = current.indexOf(idx);
    if (pos >= 0) current.splice(pos, 1); else current.push(idx);
    current.sort();
    setSelected(current);
  };

  const handleSubmit = () => {
    if (selected === null || (Array.isArray(selected) && selected.length === 0)) return;
    setAnswered(true);
    let correct = false;
    if (q._type === "single_choice") {
      correct = selected === (q.correct_option as number | undefined);
    } else if (q._type === "multiple_choice") {
      const correctOpts = Array.isArray(q.correct_option) ? q.correct_option.sort() : [];
      const selectedArr = Array.isArray(selected) ? [...selected].sort() : [];
      correct = JSON.stringify(selectedArr) === JSON.stringify(correctOpts);
    } else if (q._type === "true_false") {
      correct = selected === q.correct_answer;
    } else if (q._type === "short_answer") {
      // Short answer: always mark as submitted (manual grading)
      correct = false;
    }
    setResults((prev) => [...prev, { correct }]);
  };

  const handleNext = () => {
    if (currentIdx < total - 1) {
      setCurrentIdx(currentIdx + 1);
      setSelected(null);
      setAnswered(false);
    } else {
      setShowSummary(true);
    }
  };

  return (
    <div className="mx-auto max-w-3xl rounded-2xl border border-[var(--border)] bg-[var(--card-solid)] p-6 shadow-[var(--shadow-soft)]">
      <div className="mb-5 flex items-center gap-3">
        <div className="h-1.5 flex-1 rounded-full bg-[var(--muted)]">
          <div className="h-full rounded-full bg-[var(--foreground)] transition-all" style={{ width: `${((currentIdx + (answered ? 1 : 0)) / total) * 100}%` }} />
        </div>
        <span className="text-[11px] font-mono text-[var(--muted-foreground)]">{currentIdx + 1}/{total}</span>
      </div>

      <div className="mb-2">
        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${
          q._type === "single_choice" ? "bg-blue-50 text-blue-600" :
          q._type === "multiple_choice" ? "bg-purple-50 text-purple-600" :
          q._type === "true_false" ? "bg-amber-50 text-amber-600" :
          "bg-gray-50 text-gray-600"
        }`}>
          {q._type === "single_choice" ? "单选" :
           q._type === "multiple_choice" ? "多选" :
           q._type === "true_false" ? "判断" : "简答"}
        </span>
      </div>

      <h3 className="mb-5 text-[16px] font-bold leading-7">{q.question}</h3>

      {/* Single choice */}
      {q._type === "single_choice" && q.options ? (
        <div className="space-y-2.5">
          {q.options.map((opt, i) => {
            const isSelected = selected === i;
            const isCorrect = answered && i === q.correct_option;
            const isWrong = answered && isSelected && i !== q.correct_option;
            return (
              <button
                key={i}
                onClick={() => handleSelect(i)}
                className={`w-full rounded-xl border-2 px-4 py-3 text-left text-[14px] transition-all ${
                  isCorrect ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30" :
                  isWrong ? "border-red-400 bg-red-50 dark:bg-red-950/20 line-through opacity-70" :
                  isSelected ? "border-[var(--foreground)] bg-[var(--foreground)]/5" :
                  "border-[var(--border)] hover:border-[var(--foreground)]/40"
                }`}
              >
                <span className="mr-2 font-mono text-[12px] text-[var(--muted-foreground)]">{String.fromCharCode(65 + i)}</span>
                {opt}
              </button>
            );
          })}
        </div>
      ) : null}

      {/* Multiple choice */}
      {q._type === "multiple_choice" && q.options ? (
        <div className="space-y-2.5">
          <p className="text-[12px] text-[var(--muted-foreground)] mb-1">（多选题，可选多个答案）</p>
          {q.options.map((opt, i) => {
            const selectedArr = Array.isArray(selected) ? selected : [];
            const isSelected = selectedArr.includes(i);
            const correctArr = Array.isArray(q.correct_option) ? q.correct_option : [];
            const isCorrect = answered && correctArr.includes(i);
            const isWrong = answered && isSelected && !correctArr.includes(i);
            return (
              <button
                key={i}
                onClick={() => toggleMultiOption(i)}
                className={`w-full rounded-xl border-2 px-4 py-3 text-left text-[14px] transition-all ${
                  isCorrect ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30" :
                  isWrong ? "border-red-400 bg-red-50 dark:bg-red-950/20 line-through opacity-70" :
                  isSelected ? "border-[var(--foreground)] bg-[var(--foreground)]/5" :
                  "border-[var(--border)] hover:border-[var(--foreground)]/40"
                }`}
              >
                <span className={`mr-2 inline-flex h-5 w-5 items-center justify-center rounded border-2 text-[11px] font-bold ${
                  isSelected ? "border-[var(--foreground)] bg-[var(--foreground)] text-white" : "border-[var(--muted-foreground)]/30"
                }`}>
                  {isSelected ? "✓" : String.fromCharCode(65 + i)}
                </span>
                {opt}
              </button>
            );
          })}
        </div>
      ) : null}

      {/* True/False */}
      {q._type === "true_false" ? (
        <div className="flex gap-3">
          {[true, false].map((val) => {
            const isSelected = selected === val;
            const isCorrect = answered && val === q.correct_answer;
            const isWrong = answered && isSelected && val !== q.correct_answer;
            return (
              <button
                key={String(val)}
                onClick={() => handleSelect(val)}
                className={`flex-1 rounded-xl border-2 py-4 text-center text-[15px] font-medium transition-all ${
                  isCorrect ? "border-emerald-500 bg-emerald-50" :
                  isWrong ? "border-red-400 bg-red-50 line-through" :
                  isSelected ? "border-[var(--foreground)] bg-[var(--foreground)]/5" :
                  "border-[var(--border)] hover:border-[var(--foreground)]/40"
                }`}
              >
                {val ? "✓ 正确" : "✗ 错误"}
              </button>
            );
          })}
        </div>
      ) : null}

      {/* Short answer */}
      {q._type === "short_answer" ? (
        <div>
          <textarea
            value={typeof selected === "string" ? selected : ""}
            onChange={(e) => handleSelect(e.target.value)}
            placeholder="请在此作答..."
            className="min-h-[120px] w-full resize-none rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-[14px] leading-6 outline-none focus:border-[var(--primary)]"
          />
          {answered && explanation ? (
            <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--muted)]/45 px-4 py-3">
              <p className="text-[12px] font-semibold text-[var(--foreground)] mb-1">参考答案</p>
              <p className="text-[14px] leading-7 text-[var(--foreground)]/82">{explanation}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Explanation (after answer, for non-short-answer) */}
      {answered && q._type !== "short_answer" && explanation ? (
        <div className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--muted)]/45 px-4 py-3">
          <p className="text-[12px] font-semibold text-[var(--foreground)] mb-1">解析</p>
          <p className="text-[14px] leading-7 text-[var(--foreground)]/82">{explanation}</p>
        </div>
      ) : null}

      {/* Submit / Next */}
      <div className="mt-6">
        {!answered ? (
          <button
            onClick={handleSubmit}
            disabled={
              selected === null ||
              (Array.isArray(selected) && selected.length === 0) ||
              (q._type === "short_answer" && typeof selected === "string" && !selected.trim())
            }
            className="w-full rounded-xl bg-[var(--foreground)] py-3 text-[13px] font-medium text-white hover:opacity-90 transition disabled:opacity-30"
          >
            提交答案
          </button>
        ) : (
          <button
            onClick={handleNext}
            className="w-full rounded-xl bg-[var(--foreground)] py-3 text-[13px] font-medium text-white hover:opacity-90 transition"
          >
            {currentIdx < total - 1 ? "下一题 →" : "查看结果"}
          </button>
        )}
      </div>
    </div>
  );
}

// ── EmptyHint ──────────────────────────────────────────────────────

function EmptyHint({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card-solid)] px-6 py-16 text-center shadow-[var(--shadow-soft)]">
      <p className="text-[14px] font-semibold text-[var(--foreground)]">
        {label ? `${label}暂未生成` : "选择上方的资源类型开始学习"}
      </p>
    </div>
  );
}
