"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KGEdge, KGNode, KnowledgeGraphData, MasteryKC } from "@/lib/api";

/**
 * 自实现的知识图谱可视化（不依赖 d3）：
 * - 拓扑分层 (Sugiyama 简化版) 决定初始坐标
 * - 同层节点均匀分布 x
 * - 边用三次贝塞尔，节点用 mastery 着色
 * - 节点可拖拽，拖拽时实时更新连线
 *
 * 演示价值：体现"先学什么再学什么"的依赖结构。
 */
export function KnowledgeGraphView({
  graph,
  mastery,
}: {
  graph: KnowledgeGraphData;
  mastery: MasteryKC[];
}) {
  const initialLayout = useMemo(() => buildLayout(graph.nodes, graph.edges), [graph]);
  const masteryMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const kc of mastery) m.set(kc.kc_id, kc.mastery);
    return m;
  }, [mastery]);
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<string>("");

  // 拖拽状态
  const [positions, setPositions] = useState<Map<string, { x: number; y: number }>>(initialLayout.positions);
  // 用 ref 存储 positions 的实时值，避免 mousemove 闭包读到旧 state
  const posRef = useRef(positions);
  posRef.current = positions;

  const dragRef = useRef<{
    nodeId: string | null;
    offsetX: number;
    offsetY: number;
  }>({ nodeId: null, offsetX: 0, offsetY: 0 });

  // 当图谱数据变化时重置位置
  useEffect(() => {
    setPositions(initialLayout.positions);
  }, [initialLayout]);

  // SVG 坐标转换：用 DOMMatrix 替代废弃的 createSVGPoint
  const screenToSvg = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const inv = ctm.inverse();
    return {
      x: inv.a * clientX + inv.c * clientY + inv.e,
      y: inv.b * clientX + inv.d * clientY + inv.f,
    };
  }, []);

  const handleDragStart = useCallback(
    (nodeId: string, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const svgPos = screenToSvg(e.clientX, e.clientY);
      const nodePos = posRef.current.get(nodeId);
      if (!nodePos) return;
      dragRef.current = {
        nodeId,
        offsetX: svgPos.x - nodePos.x,
        offsetY: svgPos.y - nodePos.y,
      };
    },
    [screenToSvg],
  );

  useEffect(() => {
    function handleMove(e: MouseEvent) {
      const nid = dragRef.current.nodeId;
      if (!nid) return;
      e.preventDefault();
      const svgPos = screenToSvg(e.clientX, e.clientY);
      const nx = svgPos.x - dragRef.current.offsetX;
      const ny = svgPos.y - dragRef.current.offsetY;
      setPositions((prev) => {
        const next = new Map(prev);
        next.set(nid, { x: nx, y: ny });
        return next;
      });
    }
    function handleUp() {
      dragRef.current.nodeId = null;
    }
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [screenToSvg]);

  if (!graph.nodes.length) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-xs text-slate-400">
        尚无知识图谱。发起"资源生成"或"Auto-Tutor"后，KGGenerator 会自动构建。
      </div>
    );
  }

  const width = 720;
  const height = Math.max(280, initialLayout.maxRow * 110 + 80);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <header className="mb-2 flex items-center justify-between text-xs text-slate-500">
        <span>共 {graph.nodes.length} 节点 · {graph.edges.length} 条依赖边</span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5">拓扑布局 · 拖拽节点可调整 · 颜色 = 掌握度</span>
      </header>
      <div ref={containerRef} className="relative w-full overflow-x-auto">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          className="w-full select-none"
          style={{ minHeight: 280 }}
        >
          {/* 边 */}
          {graph.edges.map((e, i) => {
            const s = positions.get(e.source);
            const t = positions.get(e.target);
            if (!s || !t) return null;
            const dy = t.y - s.y;
            const path = `M ${s.x} ${s.y + 18} C ${s.x} ${s.y + dy * 0.5 + 18}, ${t.x} ${t.y - dy * 0.5 - 18}, ${t.x} ${t.y - 18}`;
            const active = hover === e.source || hover === e.target;
            return (
              <g key={i}>
                <path
                  d={path}
                  fill="none"
                  stroke={active ? "#0ea5e9" : "#cbd5e1"}
                  strokeWidth={active ? 2 : 1.2}
                  opacity={active ? 1 : 0.6}
                />
                <polygon
                  points={`${t.x - 4},${t.y - 18} ${t.x + 4},${t.y - 18} ${t.x},${t.y - 12}`}
                  fill={active ? "#0ea5e9" : "#94a3b8"}
                />
              </g>
            );
          })}

          {/* 节点 */}
          {graph.nodes.map((n) => {
            const pos = positions.get(n.id);
            if (!pos) return null;
            const m = masteryMap.get(n.id) ?? 0;
            const color = masteryColor(m);
            const isHover = hover === n.id;
            return (
              <g
                key={n.id}
                transform={`translate(${pos.x}, ${pos.y})`}
                onMouseEnter={() => setHover(n.id)}
                onMouseLeave={() => {
                  if (!dragRef.current.nodeId) setHover("");
                }}
                onMouseDown={(e) => handleDragStart(n.id, e)}
                style={{ cursor: "grab" }}
              >
                {/* 拖拽目标区域（更大的透明 hitbox） */}
                <rect
                  x={-60}
                  y={-22}
                  width={120}
                  height={44}
                  rx={12}
                  fill="transparent"
                  stroke="none"
                />
                <rect
                  x={-58}
                  y={-18}
                  width={116}
                  height={36}
                  rx={10}
                  fill="#fff"
                  stroke={color}
                  strokeWidth={isHover ? 3 : 2}
                  style={{ filter: isHover ? "drop-shadow(0 2px 6px rgba(0,0,0,0.12))" : "none", transition: "filter 0.15s" }}
                />
                <circle cx={-46} cy={0} r={6} fill={color} />
                <text
                  x={-34}
                  y={4}
                  fontSize={12}
                  fill="#0f172a"
                  fontWeight={600}
                  style={{ pointerEvents: "none" }}
                >
                  {truncate(n.label, 8)}
                </text>
                <text
                  x={-34}
                  y={16}
                  fontSize={9}
                  fill="#64748b"
                  style={{ pointerEvents: "none" }}
                >
                  {Math.round(m * 100)}% 掌握
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {hover ? (
        <NodeDetail node={graph.nodes.find((n) => n.id === hover)} mastery={masteryMap.get(hover) ?? 0} />
      ) : (
        <p className="mt-2 text-xs text-slate-400">悬停节点查看详情</p>
      )}
    </div>
  );
}

function NodeDetail({ node, mastery }: { node?: KGNode; mastery: number }) {
  if (!node) return null;
  return (
    <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-slate-800">{node.label}</span>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
          style={{ background: masteryColor(mastery) }}
        >
          掌握 {Math.round(mastery * 100)}%
        </span>
      </div>
      <p className="mt-1 text-slate-600">{node.summary || "—"}</p>
      <p className="mt-1 text-[10px] text-slate-400">
        类别 {node.category} · 难度 {(node.difficulty * 100).toFixed(0)}%
        {node.tags?.length ? ` · ${node.tags.join("、")}` : ""}
      </p>
    </div>
  );
}

function masteryColor(m: number): string {
  const t = Math.max(0, Math.min(1, m));
  if (t < 0.4) return "#ef4444";
  if (t < 0.7) return "#f59e0b";
  return "#10b981";
}

function truncate(text: string, n: number): string {
  return text.length <= n ? text : `${text.slice(0, n - 1)}…`;
}

// ---- 拓扑布局：把 DAG 分层，同层均匀分布 ----

interface NodePos {
  x: number;
  y: number;
}

interface LayoutResult {
  positions: Map<string, NodePos>;
  maxRow: number;
}

function buildLayout(nodes: KGNode[], edges: KGEdge[]): LayoutResult {
  const indeg = new Map<string, number>();
  const succ = new Map<string, string[]>();
  for (const n of nodes) indeg.set(n.id, 0);
  for (const e of edges) {
    if (!indeg.has(e.target) || !indeg.has(e.source)) continue;
    indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1);
    succ.set(e.source, [...(succ.get(e.source) ?? []), e.target]);
  }

  // Kahn 拓扑 → 分层
  const layer = new Map<string, number>();
  const queue: string[] = [];
  for (const [id, d] of indeg) {
    if (d === 0) {
      queue.push(id);
      layer.set(id, 0);
    }
  }
  let cursor = 0;
  while (cursor < queue.length) {
    const cur = queue[cursor++];
    for (const nxt of succ.get(cur) ?? []) {
      layer.set(nxt, Math.max(layer.get(nxt) ?? 0, (layer.get(cur) ?? 0) + 1));
      indeg.set(nxt, (indeg.get(nxt) ?? 0) - 1);
      if ((indeg.get(nxt) ?? 0) === 0) queue.push(nxt);
    }
  }

  // 兜底：图里有环或孤立节点的，全压到 layer=0
  for (const n of nodes) {
    if (!layer.has(n.id)) layer.set(n.id, 0);
  }

  const byLayer = new Map<number, string[]>();
  for (const [id, l] of layer) {
    byLayer.set(l, [...(byLayer.get(l) ?? []), id]);
  }

  const width = 720;
  const positions = new Map<string, NodePos>();
  let maxRow = 0;
  for (const [l, ids] of byLayer) {
    maxRow = Math.max(maxRow, l + 1);
    const step = width / (ids.length + 1);
    ids.forEach((id, i) => {
      positions.set(id, {
        x: step * (i + 1),
        y: 50 + l * 110,
      });
    });
  }
  return { positions, maxRow };
}
