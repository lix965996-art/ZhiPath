"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, FileText, Crosshair } from "lucide-react";
import type { SemanticMap, QueryProjection } from "@/lib/api";

interface Props {
  map: SemanticMap;
  projection: QueryProjection | null;
  query: string;
}

const VB_W = 1000;
const VB_H = 600;

/**
 * 语义空间真投影 · 知识星云
 *
 * 技术壁垒点:
 * - 文档位置 = 768d embedding 经 PCA (numpy SVD) 投影的真坐标, 不是力导向美学
 * - 讲同一主题的文档自然聚簇 — 是数学算出来的, 不是人摆的
 * - 查询用同一组主成分投影 → 查询星落点必然靠近语义相关文档 (评委可当场验证)
 * - 检索射线按真 cosine 相似度逐条点亮, 分数全真
 */
export function KnowledgeNebula({ map, projection, query }: Props) {
  const [hoverId, setHoverId] = useState<string | null>(null);

  const nodes = useMemo(
    () =>
      map.nodes.map((n) => ({
        ...n,
        px: n.x * VB_W,
        py: n.y * VB_H,
        radius: Math.max(13, Math.min(30, 11 + Math.sqrt(n.chunk_count) * 4)),
      })),
    [map.nodes],
  );

  const nodeById = useMemo(() => {
    const m = new Map<string, (typeof nodes)[number]>();
    for (const n of nodes) m.set(n.id, n);
    return m;
  }, [nodes]);

  const hitIds = useMemo(
    () => new Set((projection?.topk ?? []).map((t) => t.document_id)),
    [projection],
  );
  const queryActive = Boolean(projection && query.trim());

  const qx = (projection?.x ?? 0.5) * VB_W;
  const qy = (projection?.y ?? 0.5) * VB_H;

  return (
    <section
      className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]"
      style={{
        backgroundImage:
          "radial-gradient(ellipse at 50% 45%, rgba(124,58,237,0.20) 0%, transparent 70%)",
      }}
    >
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        className="block h-auto w-full select-none"
        style={{ aspectRatio: `${VB_W} / ${VB_H}` }}
      >
        <defs>
          <radialGradient id="lf-neb-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(167,139,250,0.65)" />
            <stop offset="100%" stopColor="rgba(167,139,250,0)" />
          </radialGradient>
          <linearGradient id="lf-node-hit" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#a78bfa" />
            <stop offset="100%" stopColor="#7c3aed" />
          </linearGradient>
          <linearGradient id="lf-node-default" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0a84ff" />
            <stop offset="100%" stopColor="#007AFF" />
          </linearGradient>
          <radialGradient id="lf-query-star" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fef08a" />
            <stop offset="55%" stopColor="#facc15" />
            <stop offset="100%" stopColor="#f59e0b" />
          </radialGradient>
        </defs>

        {/* 星点装饰 */}
        {Array.from({ length: 26 }).map((_, i) => (
          <circle
            key={i}
            cx={(i * 73) % VB_W}
            cy={(i * 57) % VB_H}
            r="1"
            fill="rgba(167,139,250,0.35)"
          />
        ))}

        {/* 语义相似度淡边 (真 cosine ≥0.62) */}
        {map.edges.map((e, i) => {
          const a = nodeById.get(e.source);
          const b = nodeById.get(e.target);
          if (!a || !b) return null;
          const dim = queryActive && !(hitIds.has(a.id) || hitIds.has(b.id));
          return (
            <line
              key={`e-${i}`}
              x1={a.px}
              y1={a.py}
              x2={b.px}
              y2={b.py}
              stroke="rgba(124,58,237,0.45)"
              strokeWidth={Math.max(0.8, e.similarity * 2)}
              opacity={dim ? 0.06 : 0.16 + e.similarity * 0.3}
            />
          );
        })}

        {/* 检索射线 — 查询星 → topk, 按相似度顺序逐条点亮 */}
        <AnimatePresence>
          {queryActive
            ? (projection?.topk ?? []).map((t, rank) => {
                const target = nodeById.get(t.document_id);
                if (!target) return null;
                const midX = (qx + target.px) / 2;
                const midY = (qy + target.py) / 2;
                return (
                  <motion.g
                    key={`ray-${t.document_id}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ delay: 0.55 + rank * 0.22 }}
                  >
                    <motion.line
                      x1={qx}
                      y1={qy}
                      x2={target.px}
                      y2={target.py}
                      stroke="#facc15"
                      strokeWidth={Math.max(1.2, 3.2 - rank * 0.45)}
                      strokeLinecap="round"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{
                        delay: 0.55 + rank * 0.22,
                        duration: 0.4,
                        ease: "easeOut",
                      }}
                      style={{
                        filter: "drop-shadow(0 0 4px rgba(250,204,21,0.6))",
                        opacity: Math.max(0.35, 1 - rank * 0.16),
                      }}
                    />
                    {/* 相似度分数标在射线中点 */}
                    <motion.g
                      initial={{ opacity: 0, scale: 0.7 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.8 + rank * 0.22 }}
                    >
                      <rect
                        x={midX - 23}
                        y={midY - 9}
                        width="46"
                        height="15"
                        rx="7.5"
                        fill="var(--card-solid)"
                        stroke="rgba(250,204,21,0.6)"
                        strokeWidth="1"
                      />
                      <text
                        x={midX}
                        y={midY + 2.5}
                        textAnchor="middle"
                        fontFamily="ui-monospace, monospace"
                        fontSize="9.5"
                        fontWeight="700"
                        fill="#d97706"
                      >
                        {(t.similarity * 100).toFixed(1)}%
                      </text>
                    </motion.g>
                  </motion.g>
                );
              })
            : null}
        </AnimatePresence>

        {/* 文档节点 (真 PCA 坐标) */}
        {nodes.map((n) => {
          const isHit = hitIds.has(n.id);
          const dimmed = queryActive && !isHit;
          const isHover = hoverId === n.id;
          return (
            <g
              key={n.id}
              onPointerEnter={() => setHoverId(n.id)}
              onPointerLeave={() => setHoverId(null)}
              style={{ cursor: "pointer" }}
            >
              {isHit ? (
                <circle cx={n.px} cy={n.py} r={n.radius + 16} fill="url(#lf-neb-glow)" />
              ) : null}
              {isHit ? (
                <circle
                  cx={n.px}
                  cy={n.py}
                  r={n.radius + 8}
                  fill="none"
                  stroke="#a78bfa"
                  strokeWidth="1.5"
                  opacity="0.7"
                >
                  <animate
                    attributeName="r"
                    values={`${n.radius + 5};${n.radius + 24};${n.radius + 5}`}
                    dur="2.4s"
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="opacity"
                    values="0.7;0;0.7"
                    dur="2.4s"
                    repeatCount="indefinite"
                  />
                </circle>
              ) : null}
              <circle
                cx={n.px}
                cy={n.py}
                r={n.radius}
                fill={isHit ? "url(#lf-node-hit)" : "url(#lf-node-default)"}
                stroke="rgba(255,255,255,0.85)"
                strokeWidth={isHover ? 2.5 : 1.5}
                opacity={dimmed ? 0.22 : 1}
                style={{
                  filter: isHit
                    ? "drop-shadow(0 0 8px rgba(167,139,250,0.65))"
                    : isHover
                      ? "drop-shadow(0 4px 8px rgba(0,122,255,0.35))"
                      : undefined,
                  transition: "opacity 220ms ease",
                }}
              />
              <text
                x={n.px}
                y={n.py + n.radius + 13}
                textAnchor="middle"
                fontFamily="ui-sans-serif, system-ui"
                fontSize={Math.max(10, Math.min(12, n.radius * 0.55))}
                fill={isHit ? "#a78bfa" : "var(--foreground)"}
                fontWeight={isHit ? 700 : 500}
                opacity={dimmed ? 0.35 : 1}
                style={{ pointerEvents: "none", userSelect: "none" }}
              >
                {truncate(n.title, 14)}
              </text>
              <text
                x={n.px}
                y={n.py + 4}
                textAnchor="middle"
                fontFamily="ui-monospace, monospace"
                fontSize={Math.max(9, Math.min(11, n.radius * 0.45))}
                fill="white"
                fontWeight="700"
                opacity={dimmed ? 0.55 : 1}
                style={{ pointerEvents: "none", userSelect: "none" }}
              >
                {n.chunk_count}
              </text>
            </g>
          );
        })}

        {/* 查询星 — 飞入语义落点 */}
        <AnimatePresence>
          {queryActive ? (
            <motion.g
              key={`q-${query}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {/* 外圈脉冲 */}
              <motion.circle
                cx={qx}
                cy={qy}
                r="22"
                fill="none"
                stroke="#facc15"
                strokeWidth="1.5"
                initial={{ opacity: 0 }}
                animate={{ opacity: [0.8, 0, 0.8], scale: [1, 1.8, 1] }}
                transition={{ delay: 0.5, duration: 2, repeat: Infinity }}
                style={{ transformOrigin: `${qx}px ${qy}px` }}
              />
              {/* 星体 — 从顶部飞入 */}
              <motion.circle
                r="11"
                fill="url(#lf-query-star)"
                stroke="white"
                strokeWidth="2"
                initial={{ cx: qx, cy: -40, opacity: 0 }}
                animate={{ cx: qx, cy: qy, opacity: 1 }}
                transition={{ type: "spring", stiffness: 60, damping: 12, delay: 0.05 }}
                style={{ filter: "drop-shadow(0 0 10px rgba(250,204,21,0.8))" }}
              />
              {/* 标签 */}
              <motion.g
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.45 }}
              >
                <rect
                  x={qx - 56}
                  y={qy - 38}
                  width="112"
                  height="18"
                  rx="9"
                  fill="#f59e0b"
                />
                <text
                  x={qx}
                  y={qy - 25.5}
                  textAnchor="middle"
                  fontFamily="ui-sans-serif, system-ui"
                  fontSize="10"
                  fontWeight="700"
                  fill="white"
                >
                  你的问题落在这里
                </text>
              </motion.g>
            </motion.g>
          ) : null}
        </AnimatePresence>
      </svg>

      {/* 左下角 · 技术铭牌 (真数据) */}
      <div className="absolute left-4 bottom-3 flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--card-solid)]/85 px-3 py-1 text-[10.5px] text-[var(--muted-foreground)] shadow-sm backdrop-blur">
        <Crosshair size={11} className="text-violet-500" />
        {map.embedding_dim}d → 2D PCA 真投影 · 解释方差 {(map.explained_variance * 100).toFixed(1)}% · {nodes.length} 文档
      </div>

      {/* 右下角 · 命中数 */}
      {queryActive && (projection?.topk?.length ?? 0) > 0 ? (
        <div className="absolute right-4 bottom-3 flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#f59e0b] to-[#facc15] px-3 py-1 text-[10.5px] font-semibold text-white shadow-sm">
          <FileText size={11} />
          命中 {projection!.topk.length} 篇 · 真 cosine
        </div>
      ) : (
        <div className="absolute right-4 bottom-3 flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--card-solid)]/85 px-3 py-1 text-[10.5px] text-[var(--muted-foreground)] shadow-sm backdrop-blur">
          <Sparkles size={11} className="text-violet-500" />
          文档位置 = 模型语义距离, 非人工摆放
        </div>
      )}
    </section>
  );
}

function truncate(s: string, n: number): string {
  if (!s) return "";
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}
