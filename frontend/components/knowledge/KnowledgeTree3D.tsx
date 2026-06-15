"use client";

import dynamic from "next/dynamic";
import { Component, type ReactNode } from "react";
import { CognitiveStarmap } from "./CognitiveStarmap";
import type { StarmapModel } from "./starmap-data";

interface Props {
  model: StarmapModel;
  selectedId: string | null;
  onSelect: (id: string) => void;
  queryHits: string[];
  query: string;
}

const TreeScene = dynamic(() => import("./tree3d/TreeScene").then((m) => m.TreeScene), {
  ssr: false,
  loading: () => <TreeSkeleton />,
});

/** WebGL 不可用时降级到 2D 星图，主流程不受影响。 */
class WebGLBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  componentDidCatch(err: Error) {
    console.warn("[KnowledgeTree3D WebGL fallback]", err);
  }
  render() {
    return this.state.error ? this.props.fallback : this.props.children;
  }
}

export function KnowledgeTree3D({ model, selectedId, onSelect, queryHits, query }: Props) {
  return (
    <section
      className="relative overflow-hidden rounded-[18px] border border-[var(--border)] bg-[var(--card)]"
      style={{
        boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
      }}
    >
      <div className="absolute left-4 top-4 z-10">
        <p className="text-[13px] font-semibold">空间视图</p>
        <p className="mt-0.5 text-[11px] text-[var(--muted-foreground)]">辅助定位，不替代目录</p>
      </div>

      <div className="h-[420px] w-full">
        <WebGLBoundary
          fallback={
            <CognitiveStarmap
              model={model}
              selectedId={selectedId}
              onSelect={onSelect}
              queryHits={queryHits}
              query={query}
            />
          }
        >
          <TreeScene model={model} selectedId={selectedId} onSelect={onSelect} queryHits={queryHits} />
        </WebGLBoundary>
      </div>

      {/* 图例 */}
      <div className="pointer-events-none absolute bottom-3 left-4 flex flex-wrap gap-3.5 text-[11px] text-[var(--muted-foreground)]">
        <span className="flex items-center gap-1.5"><span style={{ width: 8, height: 8, borderRadius: 99, background: "#007aff" }} />数据结构</span>
        <span className="flex items-center gap-1.5"><span style={{ width: 8, height: 8, borderRadius: 99, background: "#5856d6" }} />组成原理</span>
        <span className="flex items-center gap-1.5"><span style={{ width: 8, height: 8, borderRadius: 99, background: "#ff9500" }} />操作系统</span>
        <span className="flex items-center gap-1.5"><span style={{ width: 8, height: 8, borderRadius: 99, background: "#34c759" }} />计网</span>
      </div>

      <div className="pointer-events-none absolute bottom-3 right-4 text-[11px] text-[var(--muted-foreground)]">
        拖拽旋转 · 点考点看依据
      </div>
    </section>
  );
}

function TreeSkeleton() {
  return (
    <div className="flex h-full items-center justify-center text-[12px]" style={{ color: "#8a85a0" }}>
      正在加载 408 知识图…
    </div>
  );
}
