"use client";

import dynamic from "next/dynamic";
import { Component, type ReactNode } from "react";
import { ORBITAL_NODES, type OrbitalNode } from "./nodes";

interface Props {
  isStreaming?: boolean;
  hasProfile?: boolean;
  hasResource?: boolean;
  hasKnowledge?: boolean;
  hasFeedback?: boolean;
  onRun?: (prompt?: string, capability?: string) => void;
}

const SceneClient = dynamic(() => import("./Scene").then((m) => m.Scene), {
  ssr: false,
  loading: () => <SceneSkeleton />,
});

/** WebGL 失败时降级用 */
class SceneBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(err: Error) {
    console.warn("[Orbital3D WebGL fallback]", err);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full items-center justify-center rounded-3xl bg-slate-900 text-xs text-white/70">
          ⚠ WebGL 初始化失败，已降级。请检查浏览器硬件加速。
        </div>
      );
    }
    return this.props.children;
  }
}

export function Orbital3DStage({
  isStreaming,
  hasProfile,
  hasResource,
  hasKnowledge,
  hasFeedback,
  onRun,
}: Props) {
  const highlights: Record<string, boolean> = {
    profile: Boolean(hasProfile),
    resource: Boolean(hasResource),
  };

  function handlePick(node: OrbitalNode) {
    onRun?.(node.prompt, node.capability);
  }

  const stats = [
    { label: "画像", on: hasProfile, color: "#06b6d4" },
    { label: "资源", on: hasResource, color: "#a78bfa" },
    { label: "知识", on: hasKnowledge, color: "#10b981" },
    { label: "反馈", on: hasFeedback, color: "#f43f5e" },
  ];

  return (
    <div className="relative mx-auto my-6 h-[440px] w-full max-w-[680px] overflow-hidden rounded-3xl border border-white/5">
      {/* 背景渐变 */}
      <div
        className="absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(ellipse at 50% 40%, rgba(124,58,237,0.25) 0%, transparent 60%), radial-gradient(ellipse at 80% 80%, rgba(14,165,233,0.18) 0%, transparent 55%), #0a0a18",
        }}
      />

      <SceneBoundary>
        <SceneClient
          nodes={ORBITAL_NODES}
          isStreaming={isStreaming}
          highlights={highlights}
          onPickNode={handlePick}
        />
      </SceneBoundary>

      {/* 底部状态条 */}
      <div className="pointer-events-none absolute inset-x-4 bottom-3 z-20 flex items-center justify-between gap-2 text-[11px]">
        <div className="flex flex-wrap items-center gap-1.5 rounded-full bg-black/35 px-2.5 py-1 backdrop-blur-md">
          {stats.map((s) => (
            <span
              key={s.label}
              className="flex items-center gap-1 rounded-full px-1.5 py-0.5 text-white"
              style={{ opacity: s.on ? 1 : 0.45 }}
            >
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ background: s.on ? s.color : "#94a3b8" }}
              />
              {s.label}
            </span>
          ))}
        </div>
        <span
          className={`rounded-full px-2.5 py-1 backdrop-blur-md ${
            isStreaming
              ? "bg-[var(--primary)]/30 text-white"
              : "bg-black/35 text-white/70"
          }`}
        >
          {isStreaming ? "● 运行中" : "○ 待命"}
        </span>
      </div>

      {/* 提示 */}
      <div className="pointer-events-none absolute left-4 top-3 z-20 rounded-full bg-black/35 px-2.5 py-1 text-[10px] text-white/70 backdrop-blur-md">
        拖拽旋转 · 点击节点直接发问
      </div>
    </div>
  );
}

function SceneSkeleton() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-xs text-white/40">⏳ 初始化 WebGL 场景...</div>
    </div>
  );
}
