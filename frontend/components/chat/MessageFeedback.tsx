"use client";

import { useState } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { apiFetch } from "@/lib/api";

interface MessageFeedbackProps {
  sessionId: string;
  turnId?: string;
  capability?: string;
  variantId?: string | null;
}

export function MessageFeedback({
  sessionId,
  turnId,
  capability = "chat",
  variantId,
}: MessageFeedbackProps) {
  const [submitted, setSubmitted] = useState<number | null>(null);

  async function submit(rating: number) {
    if (submitted !== null) return;
    setSubmitted(rating);
    try {
      const res = await apiFetch("/api/v1/feedback/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          turn_id: turnId || crypto.randomUUID(),
          rating,
          capability,
          variant_id: variantId || undefined,
        }),
      });
      if (!res.ok) setSubmitted(null);
    } catch {
      setSubmitted(null);
    }
  }

  return (
    <div className="mt-2 flex items-center gap-2 text-xs">
      <button
        type="button"
        onClick={() => submit(1)}
        className={`flex items-center gap-1 rounded-full px-2 py-1 transition ${
          submitted === 1
            ? "bg-emerald-100 text-emerald-700"
            : "bg-slate-100 text-slate-500 hover:bg-slate-200"
        }`}
        title="这条回答有用"
      >
        <ThumbsUp size={11} />
      </button>
      <button
        type="button"
        onClick={() => submit(-1)}
        className={`flex items-center gap-1 rounded-full px-2 py-1 transition ${
          submitted === -1
            ? "bg-rose-100 text-rose-700"
            : "bg-slate-100 text-slate-500 hover:bg-slate-200"
        }`}
        title="这条回答没帮助"
      >
        <ThumbsDown size={11} />
      </button>
      {submitted !== null ? (
        <span className="text-[10px] text-slate-400">
          已记录 · 用于校准下次 prompt 选择
        </span>
      ) : (
        <span className="text-[10px] text-slate-400">
          觉得有用就赞一个 → 会写入 A/B 实验框架
        </span>
      )}
    </div>
  );
}
