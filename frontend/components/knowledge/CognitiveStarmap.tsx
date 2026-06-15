"use client";

import { useMemo, useState } from "react";
import { SUBJECTS, type StarmapModel, type StarNode, type Tier } from "./starmap-data";

interface Props {
  model: StarmapModel;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** 命中考点 id（词法匹配），用于高亮 + 彗星落点 */
  queryHits: string[];
  query: string;
}

const VB_W = 1000;
const VB_H = 560;
const CORE_X = 500;
const CORE_Y = 280;

const TIER_FILL: Record<Tier, string> = {
  mastered: "#f0a93a",
  consolidating: "#2f86ff",
  weak: "#f4607a",
};

/** 确定性星尘（mulberry32 seed），SSR / client 一致，避免水合不一致。 */
function makeField(): Array<{ x: number; y: number; r: number; d: number }> {
  let a = 0x9e3779b9 >>> 0;
  const rnd = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return Array.from({ length: 34 }, () => ({
    x: rnd() * VB_W,
    y: rnd() * VB_H,
    r: 0.5 + rnd() * 1.1,
    d: rnd() * 4,
  }));
}

export function CognitiveStarmap({ model, selectedId, onSelect, queryHits, query }: Props) {
  const [hoverId, setHoverId] = useState<string | null>(null);
  const field = useMemo(makeField, []);

  const pos = useMemo(() => {
    const m = new Map<string, StarNode>();
    for (const n of model.nodes) m.set(n.id, n);
    return m;
  }, [model.nodes]);

  const hitSet = useMemo(() => new Set(queryHits), [queryHits]);
  const queryActive = Boolean(query.trim() && queryHits.length > 0);
  const cometTarget = queryActive ? pos.get(queryHits[0]) ?? null : null;

  const remediationPath = useMemo(() => {
    const pts = model.remediation
      .map((id) => pos.get(id))
      .filter((n): n is StarNode => Boolean(n))
      .map((n) => `${(n.x * VB_W).toFixed(1)},${(n.y * VB_H).toFixed(1)}`);
    return pts.length >= 2 ? pts.join(" ") : "";
  }, [model.remediation, pos]);

  const masteryPct = Math.round(model.avgMastery * 100);

  return (
    <section
      className="relative overflow-hidden rounded-[18px] border"
      style={{
        borderColor: "rgba(124,58,237,0.12)",
        background:
          "radial-gradient(120% 95% at 50% 30%, #ffffff 0%, #f6f4fe 48%, #edf0fb 100%)",
      }}
    >
      <style>{`
        @keyframes csm-tw{0%,100%{opacity:.18}50%{opacity:.6}}
        @keyframes csm-dash{to{stroke-dashoffset:-220}}
        @keyframes csm-pulse{0%,100%{r:7}50%{r:9.5}}
        @keyframes csm-ring{0%{r:9;opacity:.55}70%{r:26;opacity:0}100%{r:26;opacity:0}}
        @keyframes csm-comet{0%{opacity:0;transform:translate(-280px,-210px)}30%{opacity:1}100%{opacity:1;transform:translate(0,0)}}
        @keyframes csm-qpulse{0%,100%{opacity:.7;transform:scale(1)}50%{opacity:0;transform:scale(1.9)}}
      `}</style>

      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="block h-auto w-full select-none" style={{ aspectRatio: `${VB_W} / ${VB_H}` }}>
        <defs>
          <linearGradient id="csm-core" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#7c3aed" />
          </linearGradient>
          <radialGradient id="csm-coreglow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(124,90,237,0.26)" />
            <stop offset="100%" stopColor="rgba(124,90,237,0)" />
          </radialGradient>
          <radialGradient id="csm-gold" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(244,176,64,0.45)" />
            <stop offset="100%" stopColor="rgba(244,176,64,0)" />
          </radialGradient>
          <radialGradient id="csm-red" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(244,96,122,0.4)" />
            <stop offset="100%" stopColor="rgba(244,96,122,0)" />
          </radialGradient>
        </defs>

        {/* 背景星尘 */}
        {field.map((s, i) => (
          <circle key={`f-${i}`} cx={s.x} cy={s.y} r={s.r} fill="#7c3aed" opacity="0.4"
            style={{ animation: `csm-tw ${(2.4 + (i % 5) * 0.6).toFixed(1)}s ease-in-out infinite`, animationDelay: `-${s.d.toFixed(1)}s` }} />
        ))}

        {/* 核心 → 星座锚点 */}
        {SUBJECTS.map((s) => (
          <line key={`hub-${s.key}`} x1={CORE_X} y1={CORE_Y} x2={s.ax * VB_W} y2={s.ay * VB_H}
            stroke="rgba(124,58,237,0.14)" strokeWidth={1} />
        ))}

        {/* 前置依赖边 */}
        {model.links.map((l, i) => {
          const a = pos.get(l.source);
          const b = pos.get(l.target);
          if (!a || !b) return null;
          const dim = queryActive && !(hitSet.has(a.id) || hitSet.has(b.id));
          return (
            <line key={`l-${i}`} x1={a.x * VB_W} y1={a.y * VB_H} x2={b.x * VB_W} y2={b.y * VB_H}
              stroke="rgba(124,58,237,0.16)" strokeWidth={1} opacity={dim ? 0.4 : 1} />
          );
        })}

        {/* 补救航线 */}
        {remediationPath ? (
          <polyline points={remediationPath} fill="none" stroke="#f0884b" strokeWidth={2}
            strokeDasharray="5 7" style={{ animation: "csm-dash 3.5s linear infinite" }} />
        ) : null}

        {/* 学习轨迹线（最近学习的知识点连线） */}
        {model.recentLearned.length >= 2 ? (
          <polyline
            points={model.recentLearned
              .map((id) => pos.get(id))
              .filter((n): n is StarNode => Boolean(n))
              .map((n) => `${(n.x * VB_W).toFixed(1)},${(n.y * VB_H).toFixed(1)}`)
              .join(" ")}
            fill="none"
            stroke="rgba(59,130,246,0.3)"
            strokeWidth={1.5}
            strokeDasharray="4 6"
            style={{ animation: "csm-dash 5s linear infinite" }}
          />
        ) : null}

        {/* 考点星 */}
        {model.nodes.map((n) => {
          const cx = n.x * VB_W;
          const cy = n.y * VB_H;
          const isSel = selectedId === n.id;
          const isHover = hoverId === n.id;
          const dim = queryActive && !hitSet.has(n.id);
          const fill = TIER_FILL[n.tier];
          const showPct = isSel || isHover;
          // 亮度基于学习次数：0 次=暗淡，1-3 次=中等，4+ 次=明亮
          const brightness = n.learningCount === 0 ? 0.4 : n.learningCount <= 3 ? 0.7 : 1;
          const isLearned = n.learningCount > 0;
          return (
            <g key={n.id} onPointerEnter={() => setHoverId(n.id)} onPointerLeave={() => setHoverId(null)}
              onClick={() => onSelect(n.id)} style={{ cursor: "pointer", opacity: dim ? 0.3 : brightness, transition: "opacity 220ms ease" }}>
              {n.tier === "mastered" ? <circle cx={cx} cy={cy} r={20} fill="url(#csm-gold)" /> : null}
              {n.tier === "weak" ? <circle cx={cx} cy={cy} r={15} fill="url(#csm-red)" /> : null}
              {isSel ? (
                <circle cx={cx} cy={cy} r={13} fill="none" stroke="#7c3aed" strokeWidth={1.6}>
                  <animate attributeName="r" values="11;18;11" dur="2.2s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.7;0.1;0.7" dur="2.2s" repeatCount="indefinite" />
                </circle>
              ) : null}
              {/* 已学习的节点有光晕 */}
              {isLearned && !isSel ? (
                <circle cx={cx} cy={cy} r={12} fill="none" stroke={fill} strokeWidth={0.8} opacity={0.4}>
                  <animate attributeName="r" values="10;14;10" dur="3s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.4;0.1;0.4" dur="3s" repeatCount="indefinite" />
                </circle>
              ) : null}
              <circle cx={cx} cy={cy} r={isHover ? 8.5 : 7} fill={fill} stroke="#ffffff" strokeWidth={isSel ? 2 : 1.2}>
                {n.tier === "weak" ? <animate attributeName="r" values="7;9;7" dur="2.4s" repeatCount="indefinite" /> : null}
              </circle>
              <text x={cx} y={cy + 21} textAnchor="middle" fontFamily="ui-sans-serif, system-ui"
                fontSize={11.5} fontWeight={isSel ? 600 : 500} fill={isSel ? "#7c3aed" : "#3a3850"}
                style={{ pointerEvents: "none" }}>
                {n.label}
              </text>
              {showPct ? (
                <text x={cx} y={cy - 13} textAnchor="middle" fontFamily="ui-monospace, monospace"
                  fontSize={10.5} fontWeight={600} fill={fill} style={{ pointerEvents: "none" }}>
                  {isLearned ? `${n.learningCount}次` : `${Math.round(n.mastery * 100)}%`}
                </text>
              ) : null}
            </g>
          );
        })}

        {/* 查询彗星 */}
        {cometTarget ? (
          <g key={`comet-${query}`} transform={`translate(${(cometTarget.x * VB_W).toFixed(1)},${(cometTarget.y * VB_H).toFixed(1)})`}>
            <circle r={11} fill="none" stroke="#f59e0b" strokeWidth={1.4}
              style={{ animation: "csm-qpulse 2s ease-in-out infinite", transformOrigin: "center" }} />
            <g style={{ animation: "csm-comet 1.1s ease-out" }}>
              <line x1={-26} y1={-20} x2={0} y2={0} stroke="rgba(59,130,246,0.6)" strokeWidth={2} strokeLinecap="round" />
              <circle r={4} fill="#3b82f6" />
            </g>
            <text x={0} y={-20} textAnchor="middle" fontFamily="ui-sans-serif, system-ui" fontSize={11}
              fontWeight={600} fill="#b45309">你的问题落在这里</text>
          </g>
        ) : null}

        {/* 核心 */}
        <circle cx={CORE_X} cy={CORE_Y} r={50} fill="url(#csm-coreglow)" />
        <circle cx={CORE_X} cy={CORE_Y} r={26} fill="url(#csm-core)" />
        <text x={CORE_X} y={CORE_Y - 2} textAnchor="middle" fontFamily="ui-sans-serif, system-ui" fontSize={17} fontWeight={600} fill="#ffffff">{masteryPct}%</text>
        <text x={CORE_X} y={CORE_Y + 15} textAnchor="middle" fontFamily="ui-sans-serif, system-ui" fontSize={10.5} fill="rgba(255,255,255,0.88)">你的星图</text>
      </svg>

      {/* 顶部 · 学习进度 + 数据来源 */}
      <div className="absolute left-4 top-3 flex items-center gap-2">
        <span className="text-[11.5px] font-medium" style={{ color: "#6d4ea8", background: "rgba(124,58,237,0.08)", border: "0.5px solid rgba(124,58,237,0.16)", padding: "3px 10px", borderRadius: 99 }}>
          已学习 {model.learnedCount} / {model.total} 个考点
        </span>
        <span className="text-[10.5px]" style={{ color: model.mode === "real" ? "#1d9e75" : "#8a85a0", background: model.mode === "real" ? "rgba(29,158,117,0.10)" : "rgba(138,133,160,0.10)", padding: "3px 9px", borderRadius: 99 }}>
          {model.mode === "real" ? "基于真实学习记录" : "基于会话关键词统计"}
        </span>
      </div>

      {/* 图例 */}
      <div className="absolute left-4 bottom-3 flex gap-3.5 text-[11px]" style={{ color: "#6a6580" }}>
        <span className="flex items-center gap-1.5"><span style={{ width: 8, height: 8, borderRadius: 99, background: "#f0a93a", boxShadow: "0 0 7px rgba(240,169,58,.6)" }} />已掌握</span>
        <span className="flex items-center gap-1.5"><span style={{ width: 8, height: 8, borderRadius: 99, background: "#2f86ff" }} />巩固中</span>
        <span className="flex items-center gap-1.5"><span style={{ width: 8, height: 8, borderRadius: 99, background: "#f4607a" }} />薄弱</span>
        <span className="flex items-center gap-1.5"><span style={{ width: 8, height: 8, borderRadius: 99, background: "#7c3aed", opacity: 0.4 }} />未学习</span>
      </div>

      <div className="absolute right-4 bottom-3 text-[11px]" style={{ color: "#8a85a0" }}>点一颗星 → 看依据与去处</div>
    </section>
  );
}
