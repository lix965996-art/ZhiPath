"use client";

import { Film, Sparkles, Volume2 } from "lucide-react";
import type { LearningResourcePackage } from "@/lib/api";

export function VideoLessonView({ pkg }: { pkg: LearningResourcePackage }) {
  const video = pkg.resources.video_lesson;

  if (!video?.url) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card-solid)] px-6 py-16 text-center shadow-[var(--shadow-soft)]">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--muted)]">
          <Film size={20} className="text-[var(--muted-foreground)]" />
        </div>
        <p className="text-[14px] font-semibold">动画视频暂未生成</p>
        <p className="max-w-md text-[12px] leading-6 text-[var(--muted-foreground)]">
          当学习主题命中模板库（如快速排序、二分查找）时，系统会用 Manim 渲染动画并配讯飞 TTS 旁白。
        </p>
      </div>
    );
  }

  const provider = video.narration_provider || "讯飞 TTS";
  const duration = video.duration ? `${Math.round(video.duration)} 秒` : null;

  return (
    <article className="mx-auto max-w-4xl space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[rgba(59,130,246,0.1)] text-[var(--primary)]">
          <Film size={17} />
        </div>
        <div className="min-w-0">
          <h2 className="truncate text-[16px] font-bold">{video.title || "动画讲解视频"}</h2>
          <p className="mt-0.5 text-[12px] text-[var(--muted-foreground)]">
            画面 + 配音 + 字幕，时间轴对齐的多模态讲解
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-black shadow-[var(--shadow-soft)]">
        <video
          controls
          src={video.url}
          className="aspect-video w-full bg-black"
          preload="metadata"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--muted)] px-3 py-1 text-[11px] font-medium text-[var(--muted-foreground)]">
          <Sparkles size={12} /> Manim 渲染
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--muted)] px-3 py-1 text-[11px] font-medium text-[var(--muted-foreground)]">
          <Volume2 size={12} /> 旁白：{provider}
        </span>
        {duration ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--muted)] px-3 py-1 text-[11px] font-medium text-[var(--muted-foreground)]">
            时长 {duration}
          </span>
        ) : null}
      </div>

      <p className="rounded-xl bg-[rgba(52,199,89,0.09)] px-3 py-2.5 text-[11px] leading-5 text-emerald-700 dark:text-emerald-300">
        画面信息 100% 可控、可复现——精确知识讲解由确定性动画模板渲染，而非文生视频。
      </p>
    </article>
  );
}
