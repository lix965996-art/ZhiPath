"use client";

import { useEffect, useRef, useState } from "react";
import type { MermaidDiagram } from "@/lib/api";

/**
 * Mermaid 图表渲染卡：按需 CDN 加载 mermaid.js，避免增加 npm 包体积。
 * 失败时优雅降级，展示原始代码 + 错误提示，永远不阻塞页面。
 */
export function MermaidDiagramCard({ diagram }: { diagram: MermaidDiagram }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [showSource, setShowSource] = useState(false);

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
        theme: "neutral",
        fontFamily: "ui-sans-serif, system-ui",
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
    <div className="rounded-2xl border border-slate-200 bg-white/95 p-5 shadow-sm">
      <header className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">
            🧩 {diagram.title || "结构化图表"}
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[10px] text-slate-600">
              {diagram.diagram_type}
            </span>
            {diagram.narrative ? <span className="ml-2">{diagram.narrative}</span> : null}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowSource((s) => !s)}
          className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200"
        >
          {showSource ? "查看图表" : "查看源码"}
        </button>
      </header>

      <div
        ref={containerRef}
        className="overflow-auto rounded-xl border border-slate-100 bg-slate-50 p-3"
        style={{ minHeight: 120 }}
      >
        {showSource ? (
          <pre className="m-0 whitespace-pre-wrap break-all font-mono text-[11px] leading-5 text-slate-700">
            {diagram.mermaid_code}
          </pre>
        ) : error ? (
          <div className="space-y-2 text-xs text-amber-700">
            <p>⚠ Mermaid 渲染失败：{error}</p>
            <pre className="m-0 whitespace-pre-wrap break-all font-mono text-[11px] leading-5 text-slate-600">
              {diagram.mermaid_code}
            </pre>
          </div>
        ) : svg ? (
          <div
            className="lf-mermaid"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : (
          <p className="text-xs text-slate-400">渲染中…</p>
        )}
      </div>

      {diagram.alternatives?.length ? (
        <div className="mt-3 text-xs text-slate-500">
          <span className="font-semibold">可替代角度：</span>
          {diagram.alternatives.join(" · ")}
        </div>
      ) : null}
    </div>
  );
}
