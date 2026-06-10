"use client";

import { useMemo, useState } from "react";
import type { LearningResourcePackage } from "@/lib/api";

interface MapNode {
  id: string;
  label: string;
  children: string[];
}

interface PositionedNode extends MapNode {
  angle: number;
  depth: number;
  x: number;
  y: number;
}

export function ResourceMindMap({ pkg }: { pkg: LearningResourcePackage }) {
  const nodes = useMemo(() => buildNodes(pkg), [pkg]);
  const positioned = useMemo(() => positionNodes(nodes), [nodes]);
  const [selectedId, setSelectedId] = useState(positioned[0]?.id || "");
  const root = positioned[0];
  const selected = positioned.find((node) => node.id === selectedId) || root;

  if (!root) return null;

  return (
    <section className="rounded-[32px] border border-[var(--border)] bg-white/88 p-5 shadow-[var(--shadow-soft)]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[15px] font-semibold">知识结构图</div>
          <div className="mt-1 text-[12px] text-[var(--muted-foreground)]">
            把资源包里的讲义、练习和知识点压缩成一张可点选的结构图。
          </div>
        </div>
        <span className="rounded-full bg-[rgba(0,122,255,0.08)] px-3 py-1 text-[11px] font-medium text-[var(--primary)]">
          {nodes.length} 个节点
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-center">
        <div className="relative min-h-[330px] overflow-hidden rounded-[26px] border border-[var(--border)] bg-[linear-gradient(180deg,rgba(0,122,255,0.055),rgba(255,255,255,0.8))]">
          <svg viewBox="0 0 640 340" className="h-[330px] w-full">
            <defs>
              <linearGradient id="resource-map-link" x1="0" x2="1" y1="0" y2="1">
                <stop offset="0%" stopColor="rgba(0,122,255,0.42)" />
                <stop offset="100%" stopColor="rgba(52,199,89,0.28)" />
              </linearGradient>
              <filter id="resource-map-glow" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="7" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {positioned.slice(1).map((node) => (
              <line
                key={`${root.id}-${node.id}`}
                x1={root.x}
                y1={root.y}
                x2={node.x}
                y2={node.y}
                stroke="url(#resource-map-link)"
                strokeWidth={selectedId === node.id ? 2.8 : 1.5}
                strokeLinecap="round"
                className={selectedId === node.id ? "lf-agent-edge-active" : "lf-agent-edge-done"}
              />
            ))}

            {positioned.map((node, index) => {
              const isRoot = index === 0;
              const isSelected = selectedId === node.id;
              return (
                <g
                  key={node.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedId(node.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      setSelectedId(node.id);
                    }
                  }}
                  className="cursor-pointer outline-none"
                >
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={isRoot ? 42 : isSelected ? 32 : 26}
                    fill={isRoot ? "rgba(0,122,255,0.94)" : "white"}
                    stroke={isSelected ? "rgba(0,122,255,0.72)" : "rgba(60,60,67,0.14)"}
                    strokeWidth={isSelected ? 3 : 1}
                    filter={isSelected || isRoot ? "url(#resource-map-glow)" : undefined}
                  />
                  <text
                    x={node.x}
                    y={node.y - (isRoot ? 3 : 2)}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill={isRoot ? "white" : "var(--foreground)"}
                    fontSize={isRoot ? 13 : 11}
                    fontWeight={isRoot ? 700 : 600}
                  >
                    {shorten(node.label, isRoot ? 9 : 7)}
                  </text>
                  {!isRoot && (
                    <text
                      x={node.x}
                      y={node.y + 14}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="var(--muted-foreground)"
                      fontSize="9"
                    >
                      {node.children.length ? `${node.children.length} 子项` : "资源"}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        <div className="rounded-[24px] border border-[var(--border)] bg-white/90 p-4">
          <div className="text-[13px] font-semibold">{selected?.label || pkg.topic}</div>
          <div className="mt-2 text-[12px] leading-6 text-[var(--muted-foreground)]">
            {buildNodeSummary(selected, pkg)}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {pkg.assets.slice(0, 5).map((asset) => (
              <span
                key={`${asset.type}-${asset.label}`}
                className="rounded-full bg-[var(--muted)] px-2.5 py-1 text-[11px] text-[var(--foreground)]"
              >
                {asset.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function buildNodes(pkg: LearningResourcePackage): MapNode[] {
  const mindmapNodes = pkg.resources.mindmap?.nodes || [];
  if (mindmapNodes.length > 0) {
    return mindmapNodes.slice(0, 10).map((node) => ({
      children: node.children || [],
      id: node.id,
      label: node.label,
    }));
  }

  const generated = [
    { id: "topic", label: pkg.topic || pkg.title, children: pkg.assets.map((asset) => asset.type) },
    ...pkg.assets.slice(0, 8).map((asset) => ({
      children: [],
      id: asset.type,
      label: asset.label,
    })),
  ];
  return generated;
}

function positionNodes(nodes: MapNode[]): PositionedNode[] {
  if (nodes.length === 0) return [];

  const [root, ...children] = nodes;
  const childCount = Math.max(children.length, 1);
  const positioned: PositionedNode[] = [
    { ...root, angle: 0, depth: 0, x: 320, y: 170 },
  ];

  children.forEach((node, index) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / childCount;
    const radiusX = childCount <= 4 ? 190 : 222;
    const radiusY = childCount <= 4 ? 92 : 122;
    positioned.push({
      ...node,
      angle,
      depth: 1,
      x: 320 + Math.cos(angle) * radiusX,
      y: 170 + Math.sin(angle) * radiusY,
    });
  });

  return positioned;
}

function buildNodeSummary(node: PositionedNode | undefined, pkg: LearningResourcePackage) {
  if (!node || node.depth === 0) {
    return pkg.knowledge_evidence.has_context
      ? "该资源包已结合知识库证据生成，可用于讲义、试卷和复习材料统一展示。"
      : "该资源包来自当前学习目标和画像，适合作为一次完整学习任务的产物。";
  }

  if (node.children.length > 0) {
    return `该节点继续连接 ${node.children.length} 个子知识点，可作为后续拆题和补救练习的依据。`;
  }

  return "该节点对应一个可使用的学习资源，可在详情中查看具体内容或导出材料。";
}

function shorten(text: string, max: number) {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...`;
}
