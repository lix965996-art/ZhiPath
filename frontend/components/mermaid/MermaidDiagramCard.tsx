"use client";

import { useEffect, useRef, useState } from "react";
import type { MermaidDiagram } from "@/lib/api";

/**
 * Mermaid 图表卡 · 蓝紫科技主题
 *
 * - CDN 加载 mermaid 10.9, 自定义 themeVariables 给节点圆角/紫描边/玻璃底
 * - 注入 lf-mermaid CSS, 给节点加阴影 / 渐变 / 流动连线
 * - 失败优雅降级展示源码
 */
export function MermaidDiagramCard({ diagram }: { diagram: MermaidDiagram }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [showSource, setShowSource] = useState(false);

  useEffect(() => {
    // 注入主题样式一次
    if (!document.getElementById("lf-mermaid-style")) {
      const style = document.createElement("style");
      style.id = "lf-mermaid-style";
      style.textContent = MERMAID_STYLE_CSS;
      document.head.appendChild(style);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function ensureMermaid(): Promise<any> {
      const w = window as any;
      if (w.mermaid) return w.mermaid;
      await new Promise<void>((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js";
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error("加载 mermaid.js 失败"));
        document.head.appendChild(s);
      });
      w.mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: "base",
        fontFamily: "ui-sans-serif, system-ui",
        themeVariables: {
          // ZhiPath 蓝紫科技配色
          primaryColor: "#1e1b4b",
          primaryTextColor: "#e0e7ff",
          primaryBorderColor: "#a78bfa",
          secondaryColor: "#312e81",
          tertiaryColor: "#0f172a",
          background: "transparent",
          mainBkg: "rgba(30,27,75,0.85)",
          secondBkg: "rgba(49,46,129,0.8)",
          tertiaryBkg: "rgba(15,23,42,0.9)",
          nodeBorder: "#a78bfa",
          clusterBkg: "rgba(124,58,237,0.08)",
          clusterBorder: "rgba(167,139,250,0.45)",
          lineColor: "#a78bfa",
          edgeLabelBackground: "rgba(30,27,75,0.95)",
          textColor: "#e0e7ff",
          labelTextColor: "#e0e7ff",
          nodeTextColor: "#f5f3ff",
          // flowchart 专属
          fillType0: "rgba(124,58,237,0.85)",
          fillType1: "rgba(99,102,241,0.85)",
          fillType2: "rgba(59,130,246,0.85)",
          // 决策菱形
          fontSize: "13px",
        },
        flowchart: {
          curve: "basis",
          nodeSpacing: 36,
          rankSpacing: 48,
          padding: 12,
        },
      });
      return w.mermaid;
    }

    async function render() {
      setError("");
      setSvg("");
      try {
        const mermaid = await ensureMermaid();
        const id = `lf-mermaid-${Math.random().toString(36).slice(2, 9)}`;
        const { svg: rendered } = await mermaid.render(id, diagram.mermaid_code);
        if (!cancelled) setSvg(rendered);
      } catch (err) {
        if (!cancelled) setError((err as Error).message || String(err));
      }
    }

    if (diagram.mermaid_code?.trim()) render();
    return () => {
      cancelled = true;
    };
  }, [diagram.mermaid_code]);

  if (!diagram.mermaid_code?.trim()) return null;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-violet-500/20 bg-gradient-to-br from-[#0b1020] via-[#1a1740] to-[#0f0a2e] p-4 shadow-[0_20px_50px_-20px_rgba(124,58,237,0.4)]">
      {/* 装饰星点 */}
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 30%, rgba(167,139,250,0.18) 0%, transparent 50%), radial-gradient(circle at 80% 70%, rgba(56,189,248,0.12) 0%, transparent 50%)",
        }}
      />

      <header className="relative mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-1.5 text-[13.5px] font-semibold text-violet-100">
            <span className="inline-block h-2 w-2 rounded-full bg-violet-400 shadow-[0_0_8px_rgba(167,139,250,0.85)]" />
            {diagram.title || "结构化图表"}
          </h3>
          <div className="mt-1 flex items-center gap-2 text-[10.5px]">
            <span className="rounded-full border border-violet-400/30 bg-violet-500/15 px-2 py-0.5 font-mono text-violet-200">
              {diagram.diagram_type}
            </span>
            {diagram.narrative ? (
              <span className="text-violet-300/70">{diagram.narrative}</span>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowSource((s) => !s)}
          className="rounded-full border border-violet-400/30 bg-violet-500/15 px-2.5 py-1 text-[10.5px] font-medium text-violet-100 transition hover:bg-violet-500/25"
        >
          {showSource ? "图表" : "源码"}
        </button>
      </header>

      <div
        ref={containerRef}
        className="relative overflow-auto rounded-xl border border-violet-500/15 bg-[rgba(15,10,46,0.55)] p-3 backdrop-blur"
        style={{ minHeight: 140 }}
      >
        {showSource ? (
          <pre className="m-0 whitespace-pre-wrap break-all font-mono text-[11px] leading-5 text-violet-200/85">
            {diagram.mermaid_code}
          </pre>
        ) : error ? (
          <div className="space-y-2 text-xs text-amber-300">
            <p>⚠ Mermaid 渲染失败: {error}</p>
            <pre className="m-0 whitespace-pre-wrap break-all font-mono text-[11px] leading-5 text-violet-300/85">
              {diagram.mermaid_code}
            </pre>
          </div>
        ) : svg ? (
          <div
            className="lf-mermaid"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : (
          <p className="text-xs text-violet-300/60">渲染中 …</p>
        )}
      </div>

      {diagram.alternatives?.length ? (
        <div className="relative mt-3 text-[10.5px] text-violet-300/75">
          <span className="font-semibold text-violet-200">可替代角度: </span>
          {diagram.alternatives.join(" · ")}
        </div>
      ) : null}
    </div>
  );
}

// Mermaid 节点/连线全局美化 (一次注入)
const MERMAID_STYLE_CSS = `
.lf-mermaid svg { width: 100% !important; height: auto !important; }

/* 节点矩形 */
.lf-mermaid .node rect,
.lf-mermaid .node polygon,
.lf-mermaid .node circle,
.lf-mermaid .node ellipse,
.lf-mermaid .node path {
  rx: 8;
  ry: 8;
  filter: drop-shadow(0 4px 12px rgba(124,58,237,0.45));
  stroke-width: 1.5px !important;
}

/* 节点文字 */
.lf-mermaid .nodeLabel,
.lf-mermaid .label,
.lf-mermaid .edgeLabel,
.lf-mermaid .cluster-label,
.lf-mermaid foreignObject div {
  color: #f5f3ff !important;
  fill: #f5f3ff !important;
  font-family: ui-sans-serif, system-ui, -apple-system !important;
  font-weight: 500 !important;
}

/* 边 */
.lf-mermaid .edgePath .path,
.lf-mermaid .flowchart-link {
  stroke: #a78bfa !important;
  stroke-width: 2px !important;
  filter: drop-shadow(0 0 4px rgba(167,139,250,0.5));
}

/* 边标签底 */
.lf-mermaid .edgeLabel rect {
  fill: rgba(30,27,75,0.95) !important;
  stroke: rgba(167,139,250,0.4) !important;
  stroke-width: 1 !important;
}

/* 箭头 */
.lf-mermaid .marker {
  fill: #a78bfa !important;
  stroke: #a78bfa !important;
}

/* 集群框 */
.lf-mermaid .cluster rect {
  fill: rgba(124,58,237,0.08) !important;
  stroke: rgba(167,139,250,0.45) !important;
  stroke-dasharray: 4 4 !important;
  rx: 12;
  ry: 12;
}

/* 流动 dash (装饰) */
@keyframes lf-mermaid-flow {
  to { stroke-dashoffset: -12; }
}
.lf-mermaid .edgePath .path[stroke-dasharray] {
  animation: lf-mermaid-flow 1.4s linear infinite;
}

/* 装饰光晕 — 节点 hover 时增强 */
.lf-mermaid .node:hover rect,
.lf-mermaid .node:hover polygon,
.lf-mermaid .node:hover circle,
.lf-mermaid .node:hover ellipse {
  filter: drop-shadow(0 0 12px rgba(167,139,250,0.9));
  cursor: default;
}
`;
