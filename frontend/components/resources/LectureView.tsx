"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { LearningResourcePackage } from "@/lib/api";

// ── Types ──────────────────────────────────────────────────────────

interface LectureCue {
  index: number;
  title: string;
  text: string;
  start: number;
  end: number;
}

// ── Helpers ────────────────────────────────────────────────────────

function buildLectureCues(
  lecture: NonNullable<LearningResourcePackage["resources"]["micro_lecture"]>,
  duration: number,
): LectureCue[] {
  const sections = lecture.sections || [];
  if (!sections.length) {
    return lecture.title
      ? [{ index: 1, title: "本节主题", text: lecture.title, start: 0, end: Math.max(duration, 8) }]
      : [];
  }
  const total = Number.isFinite(duration) && duration > 1 ? duration : Math.max(sections.length * 12, 24);
  const slot = total / sections.length;
  return sections.map((section, index) => ({
    index: index + 1,
    title: section.title || `第 ${index + 1} 段`,
    text: section.summary || "",
    start: index * slot,
    end: index === sections.length - 1 ? total : (index + 1) * slot,
  }));
}

function formatTime(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds || 0));
  const mm = String(Math.floor(safe / 60)).padStart(2, "0");
  const ss = String(safe % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

// ── Subtitle Panel ─────────────────────────────────────────────────

function LectureSubtitlePanel({
  title,
  cues,
  currentTime,
  transcript,
  onReplayText,
}: {
  title?: string;
  cues: LectureCue[];
  currentTime: number;
  transcript: string;
  onReplayText: () => void;
}) {
  const [visibleLength, setVisibleLength] = useState(0);
  const activeCue = cues.find((cue) => currentTime >= cue.start && currentTime < cue.end) || cues[0];

  useEffect(() => {
    setVisibleLength(0);
    if (!transcript) return;
    const timer = window.setInterval(() => {
      setVisibleLength((current) => {
        if (current >= transcript.length) {
          window.clearInterval(timer);
          return current;
        }
        return Math.min(transcript.length, current + 3);
      });
    }, 18);
    return () => window.clearInterval(timer);
  }, [transcript]);

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--card-solid)] p-6 shadow-[var(--shadow-soft)]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-[20px] font-bold">讲义正文</h2>
          {title ? <p className="mt-1 text-[12px] text-[var(--muted-foreground)]">{title}</p> : null}
        </div>
        <button
          onClick={() => {
            setVisibleLength(0);
            onReplayText();
          }}
          className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-[12px] font-semibold text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
        >
          重播文字
        </button>
      </div>

      <div className="mb-5 rounded-2xl border border-[rgba(59,130,246,0.18)] bg-[rgba(59,130,246,0.06)] p-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="text-[12px] font-semibold text-[var(--primary)]">当前字幕</span>
          <span className="font-mono text-[11px] text-[var(--muted-foreground)]">
            {formatTime(activeCue.start)} - {formatTime(activeCue.end)}
          </span>
        </div>
        <p className="text-[17px] font-bold leading-7">{activeCue.title}</p>
        <p className="mt-2 text-[15px] leading-8 text-[var(--foreground)]/88">{activeCue.text}</p>
      </div>

      <div className="mb-5 grid gap-2 sm:grid-cols-3">
        {cues.map((cue) => {
          const active = cue.index === activeCue.index;
          return (
            <div
              key={`${cue.index}-${cue.title}`}
              className={`rounded-xl border px-3 py-2 text-[12px] ${
                active
                  ? "border-[var(--primary)] bg-[rgba(59,130,246,0.08)] text-[var(--foreground)]"
                  : "border-[var(--border)] bg-[var(--muted)]/35 text-[var(--muted-foreground)]"
              }`}
            >
              <span className="font-mono">{formatTime(cue.start)}</span>
              <span className="ml-2 font-semibold">{cue.title}</span>
            </div>
          );
        })}
      </div>

      <p className="min-h-[220px] whitespace-pre-wrap text-[15px] leading-8 text-[var(--foreground)]/88">
        {transcript.slice(0, visibleLength)}
        {visibleLength < transcript.length ? <span className="ml-0.5 inline-block h-4 w-1 translate-y-0.5 animate-pulse bg-[var(--foreground)]" /> : null}
      </p>
    </section>
  );
}

// ── Main View ──────────────────────────────────────────────────────

export function LectureView({ pkg }: { pkg: LearningResourcePackage }) {
  const lecture = pkg.resources.micro_lecture;
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cues = useMemo(() => lecture ? buildLectureCues(lecture, duration) : [], [lecture, duration]);
  const transcript = useMemo(() => cues.map((cue) => `${cue.index}. ${cue.title}\n${cue.text}`).join("\n\n"), [cues]);

  if (!lecture) return <EmptyHint label="讲义" />;

  return (
    <article className="mx-auto max-w-4xl space-y-4">
      {lecture.audio_url ? (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card-solid)] p-3 shadow-[var(--shadow-soft)]">
          <p className="mb-2 text-[11px] font-semibold text-[var(--muted-foreground)]">音频讲解</p>
          <audio
            ref={audioRef}
            controls
            src={lecture.audio_url}
            className="h-9 w-full"
            preload="metadata"
            onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || 0)}
            onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime || 0)}
          />
        </div>
      ) : null}

      {cues.length ? (
        <LectureSubtitlePanel
          title={lecture.title}
          cues={cues}
          currentTime={currentTime}
          transcript={transcript}
          onReplayText={() => {
            if (audioRef.current) {
              audioRef.current.currentTime = 0;
              setCurrentTime(0);
            }
          }}
        />
      ) : null}
    </article>
  );
}

// ── EmptyHint (shared) ─────────────────────────────────────────────

function EmptyHint({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card-solid)] px-6 py-16 text-center shadow-[var(--shadow-soft)]">
      <p className="text-[14px] font-semibold text-[var(--foreground)]">
        {label ? `${label}暂未生成` : "选择上方的资源类型开始学习"}
      </p>
    </div>
  );
}
