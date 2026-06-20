"use client";

import { Film, Sparkles, Volume2 } from "lucide-react";
import type { ChatVideo } from "@/context/ChatContext";

export function ChatVideoCard({ video }: { video: ChatVideo }) {
  if (!video?.url) return null;
  const provider = video.provider || "讯飞 TTS";
  const duration = video.duration ? `${Math.round(video.duration)} 秒` : null;

  return (
    <div className="mb-4 ml-12 max-w-2xl overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card-solid)] shadow-[var(--shadow-soft)]">
      <div className="flex items-center gap-2 px-4 pt-3 pb-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[rgba(59,130,246,0.1)] text-[var(--primary)]">
          <Film size={15} />
        </span>
        <span className="truncate text-[13px] font-semibold">{video.title || "动画讲解视频"}</span>
      </div>
      <div className="bg-black">
        <video controls src={video.url} className="aspect-video w-full bg-black" preload="metadata" />
      </div>
      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5">
        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--muted)] px-2.5 py-1 text-[10px] font-medium text-[var(--muted-foreground)]">
          <Sparkles size={11} /> Manim
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--muted)] px-2.5 py-1 text-[10px] font-medium text-[var(--muted-foreground)]">
          <Volume2 size={11} /> {provider}
        </span>
        {duration ? (
          <span className="inline-flex items-center rounded-full bg-[var(--muted)] px-2.5 py-1 text-[10px] font-medium text-[var(--muted-foreground)]">
            {duration}
          </span>
        ) : null}
      </div>
    </div>
  );
}
