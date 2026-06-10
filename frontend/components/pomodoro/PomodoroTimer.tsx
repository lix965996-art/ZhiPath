"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { apiUrl, apiFetch } from "@/lib/api";

const FOCUS_SECONDS = 25 * 60;
const SHORT_BREAK_SECONDS = 5 * 60;
const LONG_BREAK_SECONDS = 15 * 60;

type Mode = "focus" | "short_break" | "long_break";

const MODE_LABEL: Record<Mode, string> = {
  focus: "专注 25 分钟",
  short_break: "短休 5 分钟",
  long_break: "长休 15 分钟",
};

const MODE_COLOR: Record<Mode, string> = {
  focus: "#ef4444",
  short_break: "#10b981",
  long_break: "#0ea5e9",
};

export function PomodoroTimer({ sessionId }: { sessionId?: string }) {
  const [mode, setMode] = useState<Mode>("focus");
  const [remaining, setRemaining] = useState(FOCUS_SECONDS);
  const [running, setRunning] = useState(false);
  const [completedFocus, setCompletedFocus] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const total =
    mode === "focus" ? FOCUS_SECONDS : mode === "short_break" ? SHORT_BREAK_SECONDS : LONG_BREAK_SECONDS;

  useEffect(() => {
    if (!running) return;
    intervalRef.current = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          // 完成
          finish(true);
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  useEffect(() => {
    setRemaining(total);
    setRunning(false);
  }, [mode, total]);

  function finish(completed: boolean) {
    setRunning(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (sessionId) {
      const duration = total - remaining;
      apiFetch("/api/v1/study/pomodoro", {
        method: "POST",
        body: JSON.stringify({
          session_id: sessionId,
          duration_seconds: duration,
          type: mode,
          completed,
        }),
      }).catch(() => undefined);
    }
    if (completed && mode === "focus") {
      setCompletedFocus((c) => c + 1);
      const nextMode: Mode = (completedFocus + 1) % 4 === 0 ? "long_break" : "short_break";
      setMode(nextMode);
    } else if (completed) {
      setMode("focus");
    }
  }

  const mins = Math.floor(remaining / 60).toString().padStart(2, "0");
  const secs = (remaining % 60).toString().padStart(2, "0");
  const ratio = total > 0 ? (total - remaining) / total : 0;
  const color = MODE_COLOR[mode];

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
      <header className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-[var(--foreground)]">🍅 番茄钟</h3>
          <p className="text-xs text-[var(--muted-foreground)]">{MODE_LABEL[mode]} · 已完成 {completedFocus} 个专注块</p>
        </div>
        <div className="flex gap-1">
          {(["focus", "short_break", "long_break"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition ${
                mode === m
                  ? "bg-[var(--primary)] text-white"
                  : "bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--card-solid)]"
              }`}
            >
              {m === "focus" ? "专注" : m === "short_break" ? "短休" : "长休"}
            </button>
          ))}
        </div>
      </header>

      <div className="relative mx-auto h-32 w-32">
        <svg viewBox="0 0 100 100" className="h-32 w-32 -rotate-90">
          <circle cx="50" cy="50" r="44" stroke="var(--border)" strokeWidth="6" fill="none" />
          <circle
            cx="50"
            cy="50"
            r="44"
            stroke={color}
            strokeWidth="6"
            strokeDasharray={2 * Math.PI * 44}
            strokeDashoffset={2 * Math.PI * 44 * (1 - ratio)}
            strokeLinecap="round"
            fill="none"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-2xl font-bold text-[var(--foreground)]">
            {mins}:{secs}
          </span>
          <span className="text-[10px] text-[var(--muted-foreground)]">{Math.round(ratio * 100)}%</span>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => setRunning((r) => !r)}
          className="flex items-center gap-1 rounded-full bg-[var(--primary)] px-4 py-1.5 text-xs font-semibold text-white hover:opacity-90"
        >
          {running ? <Pause size={13} /> : <Play size={13} />}
          {running ? "暂停" : "开始"}
        </button>
        <button
          type="button"
          onClick={() => {
            setRunning(false);
            setRemaining(total);
          }}
          className="flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--card-solid)] px-3 py-1.5 text-xs text-[var(--foreground)] hover:bg-[var(--muted)]"
        >
          <RotateCcw size={13} />
          重置
        </button>
      </div>
    </div>
  );
}
