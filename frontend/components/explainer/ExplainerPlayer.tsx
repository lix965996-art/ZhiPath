"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, RotateCcw, Volume2 } from "lucide-react";
import { apiUrl } from "@/lib/api";
import { MermaidDiagramCard } from "@/components/mermaid/MermaidDiagramCard";

interface ExplainerSegment {
  frame_id: number;
  narration: string;
  mermaid_partial: string;
  duration_ms: number;
}

interface ExplainerScript {
  title: string;
  topic: string;
  diagram_type: string;
  full_mermaid: string;
  segments: ExplainerSegment[];
  audio_url?: string | null;
}

interface ExplainerPlayerProps {
  /** 后端 stream.result 推下来的整段 JSON string。 */
  scriptJson?: string | null;
}

/**
 * 动画讲解播放器：
 * - 按 segment 顺序逐帧渲 mermaid_partial（用 MermaidDiagramCard 复用）
 * - 同步播 audio_url（讯飞 TTS 合成的整段 mp3）
 * - 按累计 duration_ms 切换当前帧
 * - 显示当前旁白文字
 */
export function ExplainerPlayer({ scriptJson }: ExplainerPlayerProps) {
  const script = useMemo<ExplainerScript | null>(() => {
    if (!scriptJson) return null;
    try {
      return JSON.parse(scriptJson) as ExplainerScript;
    } catch {
      return null;
    }
  }, [scriptJson]);

  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // 累计偏移表：第 i 段开始的 ms 时间戳
  const cumulativeMs = useMemo(() => {
    if (!script) return [] as number[];
    const arr: number[] = [];
    let acc = 0;
    for (const s of script.segments) {
      arr.push(acc);
      acc += s.duration_ms;
    }
    return arr;
  }, [script]);

  // 监听音频 timeupdate 切帧
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !script) return;
    const onTime = () => {
      const tMs = audio.currentTime * 1000;
      let cur = 0;
      for (let i = 0; i < cumulativeMs.length; i += 1) {
        if (tMs >= cumulativeMs[i]) cur = i;
        else break;
      }
      setIdx(cur);
    };
    audio.addEventListener("timeupdate", onTime);
    return () => audio.removeEventListener("timeupdate", onTime);
  }, [script, cumulativeMs]);

  // 无音频时定时切帧（用 setTimeout 跟 duration_ms 推进）
  useEffect(() => {
    if (!playing || !script || script.audio_url) return;
    const seg = script.segments[idx];
    if (!seg) return;
    const t = setTimeout(() => {
      if (idx < script.segments.length - 1) {
        setIdx(idx + 1);
      } else {
        setPlaying(false);
      }
    }, seg.duration_ms);
    return () => clearTimeout(t);
  }, [playing, idx, script]);

  if (!script || script.segments.length === 0) return null;

  const seg = script.segments[idx];
  const progress = ((idx + 1) / script.segments.length) * 100;

  const handlePlayPause = () => {
    const audio = audioRef.current;
    if (audio) {
      if (playing) audio.pause();
      else audio.play();
    }
    setPlaying((v) => !v);
  };
  const handleReset = () => {
    setIdx(0);
    setPlaying(false);
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.pause();
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm">
      <header className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">
            🎬 {script.title || "动画讲解"}
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">
            {script.segments.length} 帧 · 第 {idx + 1} 帧
            {script.audio_url ? " · 含讯飞 TTS 旁白" : ""}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handlePlayPause}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--primary)] text-white shadow active:scale-95"
            title={playing ? "暂停" : "播放"}
          >
            {playing ? <Pause size={13} /> : <Play size={13} />}
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 active:scale-95"
            title="重播"
          >
            <RotateCcw size={12} />
          </button>
        </div>
      </header>

      <div className="mb-3 h-1 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-[var(--primary)] transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>

      <MermaidDiagramCard
        diagram={{
          title: "",
          diagram_type: script.diagram_type,
          mermaid_code: seg.mermaid_partial,
        }}
      />

      <div className="mt-3 flex items-start gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-700">
        <Volume2 size={13} className="mt-0.5 shrink-0 text-[var(--primary)]" />
        <span>{seg.narration}</span>
      </div>

      {script.audio_url ? (
        <audio
          ref={audioRef}
          src={apiUrl(script.audio_url)}
          onEnded={() => setPlaying(false)}
          className="hidden"
        />
      ) : null}
    </section>
  );
}
