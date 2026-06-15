"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import dynamic from "next/dynamic";
import {
  CaptionsOff,
  Captions,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Pause,
  Play,
  RotateCcw,
} from "lucide-react";
import { apiUrl } from "@/lib/api";
import { MermaidDiagramCard } from "@/components/mermaid/MermaidDiagramCard";

// R3F 重 (Three.js + drei + postprocessing) → 懒加载, 不阻塞首屏
const DigitalHumanStage3D = dynamic(
  () =>
    import("./DigitalHumanStage3D").then((m) => ({
      default: m.DigitalHumanStage3D,
    })),
  { ssr: false, loading: () => <DigitalHumanLoading /> },
);

function DigitalHumanLoading() {
  return (
    <div
      className="flex items-center justify-center rounded-2xl border border-violet-500/25"
      style={{
        aspectRatio: "16 / 11",
        background:
          "radial-gradient(ellipse at 50% 50%, #1a1740 0%, #0b1020 60%, #06081a 100%)",
      }}
    >
      <div className="flex flex-col items-center gap-2">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" />
        <p className="font-mono text-[10px] text-violet-300/70">
          初始化 3D 数字人…
        </p>
      </div>
    </div>
  );
}

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
  scriptJson?: string | null;
}

/**
 * AI 数字人助教播放器
 *
 * - SVG 头像 (无版权, 完全自包含)
 * - Web Audio AnalyserNode 实时分析讯飞 TTS mp3 振幅 → 嘴部 scaleY 真口型动画
 * - 字幕按 cumulativeMs 时间轴同步高亮
 * - 右侧 Mermaid 关联图 (按 segment 渐进)
 * - 后续可直接换源为 SadTalker 生成视频, 数据流不变
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
  const [captions, setCaptions] = useState(true);
  const [showDiagram, setShowDiagram] = useState(true);
  // 音频振幅 (0-1) — 驱动嘴部 scale
  const [mouth, setMouth] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const sourceConnectedRef = useRef(false);

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

  // 时间轴 → 当前帧
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

  // 无音频时按 duration_ms 推进
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

  // Web Audio · 振幅分析驱动嘴部
  const ensureAudioContext = () => {
    const audio = audioRef.current;
    if (!audio || sourceConnectedRef.current) return;
    try {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new Ctx();
      const src = ctx.createMediaElementSource(audio);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      // 跟手: 降低平滑常数
      analyser.smoothingTimeConstant = 0.35;
      src.connect(analyser);
      analyser.connect(ctx.destination);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      sourceConnectedRef.current = true;
    } catch (err) {
      console.warn("AudioContext init failed", err);
    }
  };

  useEffect(() => {
    const tick = () => {
      const analyser = analyserRef.current;
      if (analyser && playing) {
        const buf = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(buf);
        // 人声有效 0-4kHz, 加权: 基频 0-300Hz 权重 1.6, 200-1500Hz 元音权重 1.2, 1500-4kHz 辅音权重 0.6
        // fftSize=1024 → bin = sampleRate / 1024, sampleRate 通常 44100, 一个 bin ≈ 43Hz
        let lowSum = 0, midSum = 0, highSum = 0;
        for (let i = 0; i < 7; i += 1) lowSum += buf[i];           // 0-300Hz
        for (let i = 7; i < 35; i += 1) midSum += buf[i];          // 300-1500Hz
        for (let i = 35; i < 93; i += 1) highSum += buf[i];        // 1500-4000Hz
        const lowAvg = lowSum / 7 / 255;
        const midAvg = midSum / 28 / 255;
        const highAvg = highSum / 58 / 255;
        const weighted = lowAvg * 1.6 + midAvg * 1.2 + highAvg * 0.6;
        const norm = Math.min(1, weighted * 0.55);
        // 跟手: 降低平滑系数 (响应更快)
        setMouth((prev) => prev * 0.35 + norm * 0.65);
      } else {
        setMouth((prev) => prev * 0.6);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [playing]);

  // 清理 AudioContext
  useEffect(() => {
    return () => {
      if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
        audioCtxRef.current.close().catch(() => {});
      }
    };
  }, []);

  if (!script || script.segments.length === 0) return null;

  const seg = script.segments[idx];
  const progressPct = ((idx + 1) / script.segments.length) * 100;

  const handlePlayPause = () => {
    const audio = audioRef.current;
    ensureAudioContext();
    if (audioCtxRef.current?.state === "suspended") {
      audioCtxRef.current.resume().catch(() => {});
    }
    if (audio) {
      if (playing) audio.pause();
      else audio.play().catch(() => {});
    }
    setPlaying((v) => !v);
  };
  const handleReset = () => {
    setIdx(0);
    setPlaying(false);
    setMouth(0);
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.pause();
    }
  };
  const jumpTo = (target: number) => {
    if (!script) return;
    const clamped = Math.max(0, Math.min(script.segments.length - 1, target));
    setIdx(clamped);
    if (audioRef.current) {
      audioRef.current.currentTime = cumulativeMs[clamped] / 1000;
    }
  };
  const handlePrev = () => jumpTo(idx - 1);
  const handleNext = () => jumpTo(idx + 1);
  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!script) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const target = Math.floor(ratio * script.segments.length);
    jumpTo(target);
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-sm">
      {/* 顶条 · 角标 + 标题 */}
      <header className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-[#7c3aed] to-[#2563eb] px-2 py-0.5 text-[10px] font-semibold text-white">
              AI 助教 · 实时生成
            </span>
            <span className="text-[10.5px] text-[var(--muted-foreground)]">
              讯飞 TTS · 真音频驱动口型
            </span>
          </div>
          <h3 className="mt-1 truncate text-[14px] font-semibold text-[var(--foreground)]">
            {script.title || "数字人讲解"}
          </h3>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setCaptions((v) => !v)}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--card-solid)] text-[var(--muted-foreground)] active:scale-95"
            title={captions ? "关闭字幕" : "开启字幕"}
          >
            {captions ? <Captions size={12} /> : <CaptionsOff size={12} />}
          </button>
          <button
            type="button"
            onClick={() => setShowDiagram((v) => !v)}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--card-solid)] text-[var(--muted-foreground)] active:scale-95"
            title={showDiagram ? "隐藏关联图" : "展开关联图"}
          >
            <Maximize2 size={11} />
          </button>
        </div>
      </header>

      {/* 主区 · 左数字人 / 右关联图 */}
      <div
        className={`grid gap-3 p-4 ${
          showDiagram ? "lg:grid-cols-[1fr_minmax(0,1fr)]" : ""
        }`}
      >
        {/* 3D 数字人舞台 */}
        <DigitalHumanStage3D
          mouth={mouth}
          playing={playing}
                  captionText={captions ? seg.narration : ""}
                />

        {/* 右侧 · Mermaid + InsightPanel — 帧切换 fade-in */}
        {showDiagram ? (
          <div className="flex flex-col gap-3 h-full">
            <div className="flex-1 min-h-0 rounded-xl border border-violet-500/20 bg-gradient-to-br from-[#0b1020] via-[#16113a] to-[#0f0a2e] p-2.5 overflow-hidden flex flex-col">
              <div className="mb-1.5 flex items-center justify-between px-1 shrink-0">
                <p className="font-mono text-[10.5px] uppercase tracking-[0.15em] text-violet-200">
                  关联图 · 第 {idx + 1}/{script.segments.length} 帧
                </p>
                <span className="rounded-full bg-violet-500/15 px-2 py-0.5 font-mono text-[9.5px] text-violet-100">
                  {script.diagram_type}
                </span>
              </div>
              <div className="flex-1 min-h-0 overflow-auto">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
                    className="h-full"
                  >
                    <MermaidDiagramCard
                      diagram={{
                        title: "",
                        diagram_type: script.diagram_type,
                        mermaid_code: seg.mermaid_partial,
                      }}
                    />
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
            <AnimatePresence mode="wait">
              <motion.div
                key={`insight-${idx}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1], delay: 0.05 }}
              >
                <InsightPanel
                  narration={seg.narration}
                  mermaidPartial={seg.mermaid_partial}
                  frameIdx={idx}
                  totalFrames={script.segments.length}
                />
              </motion.div>
            </AnimatePresence>
          </div>
        ) : null}
      </div>

      {/* 底部控制条 */}
      <div className="border-t border-[var(--border)] bg-[var(--muted)]/40 px-4 py-2.5">
        <div className="mb-2 flex items-center gap-2">
          <button
            type="button"
            onClick={handlePlayPause}
            className="inline-flex h-8 items-center gap-1.5 rounded-full bg-gradient-to-r from-[#7c3aed] to-[#2563eb] px-3 text-[12px] font-medium text-white shadow active:scale-95"
          >
            {playing ? <Pause size={12} /> : <Play size={12} />}
            {playing ? "暂停" : "播放"}
          </button>
          <button
            type="button"
            onClick={handlePrev}
            disabled={idx === 0}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--card-solid)] text-[var(--muted-foreground)] disabled:opacity-40 active:scale-95"
            title="上一帧"
          >
            <ChevronLeft size={13} />
          </button>
          <button
            type="button"
            onClick={handleNext}
            disabled={idx >= script.segments.length - 1}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--card-solid)] text-[var(--muted-foreground)] disabled:opacity-40 active:scale-95"
            title="下一帧"
          >
            <ChevronRight size={13} />
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--card-solid)] text-[var(--muted-foreground)] active:scale-95"
            title="重播"
          >
            <RotateCcw size={12} />
          </button>
          <div className="flex-1 text-right text-[10.5px] text-[var(--muted-foreground)]">
            第 {idx + 1} / {script.segments.length} 帧
          </div>
        </div>
        {/* 进度条 (可点跳) + 帧标记 dot */}
        <div className="relative">
          <div
            className="relative h-1.5 cursor-pointer overflow-visible rounded-full bg-[var(--muted)]"
            onClick={handleProgressClick}
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#7c3aed] to-[#2563eb] transition-all"
              style={{ width: `${progressPct}%` }}
            />
            {/* 帧标记 */}
            {script.segments.map((_, i) => {
              const pct = ((i + 0.5) / script.segments.length) * 100;
              return (
                <span
                  key={i}
                  className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 transition ${
                    i <= idx
                      ? "h-2 w-2 rounded-full bg-white shadow-[0_0_6px_rgba(167,139,250,0.85)]"
                      : "h-1.5 w-1.5 rounded-full bg-violet-300/40"
                  }`}
                  style={{ left: `${pct}%` }}
                />
              );
            })}
          </div>
        </div>
      </div>

      {script.audio_url ? (
        <audio
          ref={audioRef}
          src={apiUrl(script.audio_url)}
          onEnded={() => setPlaying(false)}
          onPause={() => setPlaying(false)}
          onPlay={() => setPlaying(true)}
          crossOrigin="anonymous"
          className="hidden"
        />
      ) : null}
    </section>
  );
}

// ===== 本帧要点面板 =====

/**
 * 从 narration / mermaid_partial 自动抽取:
 * - 数学符号 / 英文术语 / 中文加点术语
 * - mermaid 节点 label (方括号内文字)
 *
 * 评委一眼对到 "讲了什么 · 关键术语 · 涉及节点"
 */
function InsightPanel({
  narration,
  mermaidPartial,
  frameIdx,
  totalFrames,
}: {
  narration: string;
  mermaidPartial: string;
  frameIdx: number;
  totalFrames: number;
}) {
  // 抽 mermaid 节点 label: 匹配 [xxx] / (xxx) / {xxx}
  const nodes = useMemo(() => {
    const set = new Set<string>();
    const re = /[\[\(\{]([^\]\)\}\n]{2,30})[\]\)\}]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(mermaidPartial)) !== null) {
      const label = m[1].trim().replace(/^[\s\|]+|[\s\|]+$/g, "");
      // 过滤掉太短/纯符号
      if (label.length >= 2 && !/^[\-=>\s]+$/.test(label)) set.add(label);
    }
    return Array.from(set).slice(0, 8);
  }, [mermaidPartial]);

  // 抽 narration 关键术语 — 英文大写词 + 数学符号词 + 中文常见术语
  const keywords = useMemo(() => {
    const set = new Set<string>();
    // 1) 英文大写词组 (CPU / Cache / TCP 等)
    const en = narration.match(/[A-Z][A-Za-z]{2,}/g) || [];
    en.forEach((w) => set.add(w));
    // 2) 数学表达 T(n) / logN / sqrt 等
    const math = narration.match(/[A-Za-z]+\·[A-Za-z_]+|[A-Za-z_]{2,}\^?\d*|√[A-Za-z_d]+/g) || [];
    math.forEach((w) => set.add(w));
    // 3) 单字母变量 (Q / K / V) 等 (空格或中文边界)
    const vars = narration.match(/(?<=^|[\s,，。:、])[A-Z](?=[\s,，。:、]|$)/g) || [];
    vars.forEach((w) => set.add(w));
    return Array.from(set).slice(0, 10);
  }, [narration]);

  return (
    <div className="rounded-xl border border-violet-400/35 bg-gradient-to-br from-[#0f0a2e] via-[#1a1444] to-[#0b0720] p-3 shadow-[inset_0_0_24px_rgba(124,58,237,0.18)]">
      {/* Header */}
      <div className="mb-2.5 flex items-center justify-between">
        <p className="flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.18em] text-violet-50">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-violet-300 shadow-[0_0_8px_rgba(196,181,253,0.95)]" />
          本帧要点
        </p>
        <span className="rounded-full bg-violet-500/25 px-1.5 py-0.5 font-mono text-[9.5px] font-semibold text-violet-50">
          {frameIdx + 1}/{totalFrames}
        </span>
      </div>

      {/* 关键术语 */}
      {keywords.length > 0 ? (
        <div className="mb-3">
          <p className="mb-1.5 text-[10.5px] font-medium text-violet-200">关键术语</p>
          <div className="flex flex-wrap gap-1.5">
            {keywords.map((k) => (
              <span
                key={k}
                className="rounded-md border border-violet-300/50 bg-gradient-to-br from-violet-500/40 to-fuchsia-500/30 px-2 py-0.5 font-mono text-[11px] font-semibold text-white shadow-[0_0_10px_-1px_rgba(167,139,250,0.7)]"
              >
                {k}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {/* 涉及节点 */}
      {nodes.length > 0 ? (
        <div>
          <p className="mb-1.5 text-[10.5px] font-medium text-violet-200">
            涉及节点 · {nodes.length} 个
          </p>
          <ul className="space-y-1">
            {nodes.map((n, i) => (
              <li
                key={`${n}-${i}`}
                className="flex items-center gap-2 text-[11.5px] leading-5 text-violet-50"
              >
                <span
                  className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-400 to-fuchsia-500 font-mono text-[9.5px] font-bold text-white"
                  style={{ boxShadow: "0 0 8px rgba(196,181,253,0.7)" }}
                >
                  {i + 1}
                </span>
                <span className="truncate font-medium">{n}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {keywords.length === 0 && nodes.length === 0 ? (
        <p className="text-[11.5px] leading-5 text-violet-100/85">
          本帧暂无结构化抽取结果, 见左侧字幕。
        </p>
      ) : null}
    </div>
  );
}
