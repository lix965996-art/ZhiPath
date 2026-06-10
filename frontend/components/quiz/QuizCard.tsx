"use client";

import { useState, useEffect } from "react";
import { CheckCircle2, XCircle, Send } from "lucide-react";

interface QuizQuestion {
  question: string;
  options?: string[];
  correct_option?: number | string | number[];
  correct_answer?: boolean;
  explanation?: string;
  _type: "single_choice" | "multiple_choice" | "true_false" | "short_answer";
}

interface QuizCardProps {
  questions: QuizQuestion[];
  onSubmit: (answers: { question_index: number; answer: number | boolean | string | number[] }[]) => void;
  results?: { correct: boolean; explanation?: string }[];
  disabled?: boolean;
}

export function QuizCard({ questions, onSubmit, results, disabled }: QuizCardProps) {
  const [answers, setAnswers] = useState<Record<number, number | boolean | string | number[]>>({});
  const [submitted, setSubmitted] = useState(false);

  // questions 变化时重置状态
  useEffect(() => {
    setSubmitted(false);
    setAnswers({});
  }, [questions]);

  const handleSelect = (qIdx: number, value: number | boolean | string | number[]) => {
    if (submitted || disabled) return;
    setAnswers((prev) => ({ ...prev, [qIdx]: value }));
  };

  const handleSubmit = () => {
    if (submitted) return;
    const answerList = Object.entries(answers).map(([idx, answer]) => ({
      question_index: Number(idx),
      answer,
    }));
    setSubmitted(true);
    onSubmit(answerList);
  };

  const allAnswered = questions.every((_, idx) => answers[idx] !== undefined);

  return (
    <div className="mt-3 space-y-3">
      <div className="text-[13px] font-semibold text-[var(--foreground)]">
        测验题目 ({questions.length} 题)
      </div>

      {questions.map((q, idx) => {
        const userAnswer = answers[idx];
        const result = results?.[idx];
        const isCorrect = result?.correct;
        const showResult = submitted && result !== undefined;

        return (
          <div
            key={idx}
            className={`rounded-xl border p-3 shadow-sm transition ${
              showResult
                ? isCorrect
                  ? "border-emerald-300 bg-emerald-50/50"
                  : "border-red-300 bg-red-50/50"
                : "border-[var(--border)] bg-white"
            }`}
          >
            <div className="mb-2 text-[12px] font-medium text-[var(--foreground)]">
              <span className="mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-cyan-100 text-[10px] font-bold text-cyan-700">
                {idx + 1}
              </span>
              {q.question}
            </div>

            {q._type === "single_choice" && q.options && (
              <div className="space-y-1.5">
                {q.options.map((opt, optIdx) => {
                  const isSelected = userAnswer === optIdx;
                  const isCorrectOpt = showResult && String(optIdx) === String(q.correct_option);
                  const isWrong = showResult && isSelected && !isCorrect;
                  return (
                    <button
                      key={optIdx}
                      onClick={() => handleSelect(idx, optIdx)}
                      disabled={submitted || disabled}
                      className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-[12px] transition ${
                        isCorrectOpt
                          ? "border-emerald-400 bg-emerald-50 text-emerald-800"
                          : isWrong
                            ? "border-red-400 bg-red-50 text-red-800"
                            : isSelected
                              ? "border-cyan-400 bg-cyan-50 text-cyan-800"
                              : "border-[var(--border)] bg-white hover:bg-gray-50"
                      }`}
                    >
                      <span className="flex h-4 w-4 items-center justify-center rounded-full border text-[10px]">
                        {String.fromCharCode(65 + optIdx)}
                      </span>
                      <span className="flex-1">{opt}</span>
                      {isCorrectOpt && <CheckCircle2 size={14} className="text-emerald-600" />}
                      {isWrong && <XCircle size={14} className="text-red-600" />}
                    </button>
                  );
                })}
              </div>
            )}

            {q._type === "true_false" && (
              <div className="flex gap-2">
                {[true, false].map((val) => {
                  const isSelected = userAnswer === val;
                  const isCorrectOpt = showResult && val === q.correct_answer;
                  const isWrong = showResult && isSelected && !isCorrect;
                  return (
                    <button
                      key={String(val)}
                      onClick={() => handleSelect(idx, val)}
                      disabled={submitted || disabled}
                      className={`flex-1 rounded-lg border px-3 py-2 text-[12px] font-medium transition ${
                        isCorrectOpt
                          ? "border-emerald-400 bg-emerald-50 text-emerald-800"
                          : isWrong
                            ? "border-red-400 bg-red-50 text-red-800"
                            : isSelected
                              ? "border-cyan-400 bg-cyan-50 text-cyan-800"
                              : "border-[var(--border)] bg-white hover:bg-gray-50"
                      }`}
                    >
                      {val ? "正确" : "错误"}
                    </button>
                  );
                })}
              </div>
            )}

            {q._type === "multiple_choice" && q.options && (
              <div className="space-y-1.5">
                {q.options.map((opt, optIdx) => {
                  const selectedArr = Array.isArray(userAnswer) ? userAnswer as number[] : [];
                  const isSelected = selectedArr.includes(optIdx);
                  const correctArr = Array.isArray(q.correct_option) ? q.correct_option as number[] : [];
                  const isCorrectOpt = showResult && correctArr.includes(optIdx);
                  const isWrong = showResult && isSelected && !isCorrectOpt;
                  return (
                    <button
                      key={optIdx}
                      onClick={() => {
                        const next = isSelected
                          ? selectedArr.filter((v) => v !== optIdx)
                          : [...selectedArr, optIdx];
                        handleSelect(idx, next);
                      }}
                      disabled={submitted || disabled}
                      className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-[12px] transition ${
                        isCorrectOpt
                          ? "border-emerald-400 bg-emerald-50 text-emerald-800"
                          : isWrong
                            ? "border-red-400 bg-red-50 text-red-800"
                            : isSelected
                              ? "border-cyan-400 bg-cyan-50 text-cyan-800"
                              : "border-[var(--border)] bg-white hover:bg-gray-50"
                      }`}
                    >
                      <span className="flex h-4 w-4 items-center justify-center rounded border text-[10px]">
                        {String.fromCharCode(65 + optIdx)}
                      </span>
                      <span className="flex-1">{opt}</span>
                      {isCorrectOpt && <CheckCircle2 size={14} className="text-emerald-600" />}
                      {isWrong && <XCircle size={14} className="text-red-600" />}
                    </button>
                  );
                })}
              </div>
            )}

            {q._type === "short_answer" && (
              <div>
                {showResult ? (
                  <div className="rounded-lg border border-[var(--border)] bg-gray-50 px-3 py-2 text-[12px]">
                    <div className="mb-1 font-medium text-[var(--foreground)]">你的答案：</div>
                    <div className="text-[var(--muted-foreground)]">{String(userAnswer ?? "")}</div>
                  </div>
                ) : (
                  <textarea
                    value={String(userAnswer ?? "")}
                    onChange={(e) => handleSelect(idx, e.target.value)}
                    disabled={submitted || disabled}
                    placeholder="输入你的答案..."
                    rows={2}
                    className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-[12px] outline-none focus:border-cyan-400 disabled:opacity-60"
                  />
                )}
              </div>
            )}

            {showResult && result.explanation && (
              <div className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-[11px] text-[var(--muted-foreground)]">
                <span className="font-medium">解析：</span>
                {result.explanation}
              </div>
            )}
          </div>
        );
      })}

      {!submitted && (
        <button
          onClick={handleSubmit}
          disabled={!allAnswered || disabled}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-600 px-4 py-2.5 text-[13px] font-medium text-white shadow-sm transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Send size={14} />
          提交答案
        </button>
      )}
    </div>
  );
}
