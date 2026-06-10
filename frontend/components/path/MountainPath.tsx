"use client";

/**
 * 登山地图 · 学习路径可视化
 *
 * 米色户外地图美学: 等高线 + 蜿蜒山路 + 6 营地图钉.
 * 当前阶段 = 金旗 + 脉冲光晕. 已过营地 = 灰勾. 顶峰 = 学习目标.
 *
 * 纯 SVG, 不引新依赖。配色: cf. The North Face / Patagonia 地图美学.
 */

import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";

export interface PathStageLite {
  id: string;
  title: string;
  status: "done" | "active" | "pending";
  taskCount?: number; // 用于浮卡显示 "任务 N 项"
  routeChange?: { original: string; updated: string }; // 路线变化痕迹标签
}

interface Props {
  stages: PathStageLite[];
  learningGoal?: string;
  className?: string;
  onPick?: (stageId: string) => void;
}

// 6 个营地在 viewBox 内的位置 (从左下蜿蜒到右上 = 隐喻"上山")
const WAYPOINTS = [
  { x: 130, y: 580, label: "起点" },
  { x: 310, y: 500, label: "Camp 1" },
  { x: 480, y: 430, label: "Camp 2" },
  { x: 660, y: 370, label: "Camp 3" },
  { x: 830, y: 280, label: "Camp 4" },
  { x: 1000, y: 180, label: "Camp 5" },
];
const PEAK = { x: 1140, y: 90 };

// 通过 6 个 waypoint 的平滑曲线 — 用 monotone cubic 近似
function buildMountainPath(points: { x: number; y: number }[]) {
  if (points.length < 2) return "";
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const p0 = points[i - 1];
    const p1 = points[i];
    const dx = (p1.x - p0.x) * 0.45;
    d += ` C ${p0.x + dx} ${p0.y}, ${p1.x - dx} ${p1.y}, ${p1.x} ${p1.y}`;
  }
  return d;
}

// 等高线: 几条平滑曲线 — 模拟地形, 不用真实数据
const CONTOUR_LINES = [
  "M 60 420 C 200 410, 340 460, 500 440 S 800 380, 980 410 S 1140 370, 1180 380",
  "M 40 510 C 200 490, 360 540, 540 520 S 820 460, 1020 480 S 1160 460, 1190 460",
  "M 80 320 C 240 310, 380 360, 560 340 S 820 280, 1000 300 S 1140 270, 1190 285",
  "M 100 220 C 280 210, 460 250, 640 230 S 880 180, 1040 200 S 1160 175, 1190 188",
  "M 200 130 C 360 125, 520 155, 700 140 S 920 110, 1080 125 S 1170 110, 1190 118",
  "M 50 620 C 220 600, 380 645, 580 625 S 860 575, 1060 590 S 1170 575, 1190 580",
  "M 30 380 C 180 372, 320 415, 480 400 S 760 350, 940 375 S 1130 340, 1175 350",
];

export function MountainPath({ stages, learningGoal, className = "", onPick }: Props) {
  const six = stages.slice(0, 6);
  while (six.length < 6) {
    six.push({ id: `_pad_${six.length}`, title: "—", status: "pending" });
  }

  // 已完成路径 vs 未完成路径 (虚线): 找到最后一个 done/active 的 index
  const lastReachedIdx = Math.max(
    0,
    ...six
      .map((s, i) => (s.status === "done" || s.status === "active" ? i : -1))
      .filter((i) => i >= 0),
  );
  const reachedPath = buildMountainPath(WAYPOINTS.slice(0, lastReachedIdx + 1));
  const remainingPath = buildMountainPath(WAYPOINTS.slice(lastReachedIdx));
  // 完整 (用于绘制底色淡线)
  const fullPath = buildMountainPath([...WAYPOINTS, PEAK]);

  return (
    <div
      className={`relative overflow-hidden rounded-[28px] border ${className}`}
      style={{
        backgroundColor: "var(--card)",
        backgroundImage:
          "radial-gradient(ellipse at 50% 30%, rgba(99,102,241,0.10) 0%, transparent 70%)",
        borderColor: "rgba(99, 102, 241, 0.18)",
        boxShadow: "0 24px 60px -28px rgba(99, 102, 241, 0.25)",
      }}
    >
      <svg
        viewBox="0 0 1200 680"
        className="block h-auto w-full"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          {/* 纸张底纹滤镜 — 极淡 */}
          <filter id="lf-paper-grain">
            <feTurbulence baseFrequency="0.85" numOctaves="2" result="noise" />
            <feColorMatrix type="matrix" values="0 0 0 0 0.6 0 0 0 0 0.55 0 0 0 0 0.4 0 0 0 0.08 0" />
            <feComposite in2="SourceGraphic" operator="in" />
          </filter>
          {/* 路径渐变 (iOS 蓝 → 紫) */}
          <linearGradient id="lf-trail-grad" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#007AFF" />
            <stop offset="60%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#a78bfa" />
          </linearGradient>
          {/* 当前营地光晕 (紫) */}
          <radialGradient id="lf-flag-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(167, 139, 250, 0.65)" />
            <stop offset="100%" stopColor="rgba(167, 139, 250, 0)" />
          </radialGradient>
          {/* 顶峰远山 (雾紫) */}
          <linearGradient id="lf-peak-grad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#b8b4e8" />
            <stop offset="100%" stopColor="#8b8eff" />
          </linearGradient>
        </defs>

        {/* 等高线背景 (淡蓝灰) */}
        <g opacity="0.6" stroke="#cdd5e3" strokeWidth="1" fill="none">
          {CONTOUR_LINES.map((d, i) => (
            <path
              key={i}
              d={d}
              strokeDasharray={i % 2 === 0 ? "none" : "2 3"}
              opacity={0.35 + (i % 3) * 0.18}
            />
          ))}
        </g>

        {/* 远山顶峰 (右上) — 双层重叠出层次 */}
        <g>
          <path
            d={`M ${PEAK.x - 200} ${PEAK.y + 110}
                L ${PEAK.x - 60} ${PEAK.y - 30}
                L ${PEAK.x + 40} ${PEAK.y + 70}
                L ${PEAK.x + 140} ${PEAK.y - 10}
                L ${PEAK.x + 200} ${PEAK.y + 80}
                Z`}
            fill="url(#lf-peak-grad)"
            opacity="0.55"
          />
          <path
            d={`M ${PEAK.x - 110} ${PEAK.y + 80}
                L ${PEAK.x - 20} ${PEAK.y - 10}
                L ${PEAK.x + 60} ${PEAK.y + 50}
                L ${PEAK.x + 140} ${PEAK.y - 30}
                L ${PEAK.x + 200} ${PEAK.y + 60}
                Z`}
            fill="#6366f1"
            opacity="0.32"
          />
          {/* 顶峰小旗 (紫红) */}
          <line
            x1={PEAK.x}
            y1={PEAK.y - 30}
            x2={PEAK.x}
            y2={PEAK.y + 10}
            stroke="var(--foreground)"
            strokeWidth="2"
          />
          <path
            d={`M ${PEAK.x} ${PEAK.y - 30} L ${PEAK.x + 22} ${PEAK.y - 22} L ${PEAK.x} ${PEAK.y - 14} Z`}
            fill="#a78bfa"
          />
        </g>

        {/* 主路径: 底层淡色全程 + 已走实色 + 未走虚线 */}
        <path
          d={fullPath}
          stroke="rgba(148, 163, 184, 0.35)"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d={remainingPath}
          stroke="#94a3b8"
          strokeWidth="2.5"
          strokeDasharray="6 8"
          strokeLinecap="round"
          fill="none"
        />
        <motion.path
          d={reachedPath}
          stroke="url(#lf-trail-grad)"
          strokeWidth="4"
          strokeLinecap="round"
          fill="none"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
        />

        {/* 6 个营地 marker */}
        {WAYPOINTS.map((p, i) => {
          const stage = six[i];
          return (
            <CampMarker
              key={stage.id}
              x={p.x}
              y={p.y}
              ordinal={i + 1}
              status={stage.status}
              title={stage.title}
              onClick={onPick ? () => onPick(stage.id) : undefined}
            />
          );
        })}

        {/* 路线变化痕迹 — 分叉虚线 + "原路线 / 新路线" 双行标签 */}
        {(() => {
          const idx = six.findIndex((s) => s.status === "active");
          if (idx < 0 || idx >= WAYPOINTS.length - 1) return null;
          const stage = six[idx];
          if (!stage.routeChange) return null;
          const p = WAYPOINTS[idx];
          const next = WAYPOINTS[idx + 1];
          const dx = next.x - p.x;
          const dy = next.y - p.y;
          const angle = Math.atan2(dy, dx);
          const branchAngle = angle - Math.PI / 3.5;
          const len = 130;
          const bx = p.x + Math.cos(branchAngle) * len;
          const by = p.y + Math.sin(branchAngle) * len;
          const cx = p.x + Math.cos(branchAngle) * len * 0.4;
          const cy = p.y + Math.sin(branchAngle) * len * 0.45 + 8;
          return (
            <g pointerEvents="none">
              {/* 灰虚线 */}
              <path
                d={`M ${p.x} ${p.y} Q ${cx} ${cy}, ${bx} ${by}`}
                stroke="#94a3b8"
                strokeWidth="1.5"
                strokeDasharray="4 6"
                fill="none"
                strokeLinecap="round"
                opacity="0.55"
              />
              {/* 双行标签 */}
              <text
                x={bx + 6}
                y={by - 4}
                fontFamily="ui-sans-serif, system-ui"
                fontSize="10"
                fill="#94a3b8"
              >
                原路线: {truncate(stage.routeChange.original, 10)}
              </text>
              <text
                x={bx + 6}
                y={by + 9}
                fontFamily="ui-sans-serif, system-ui"
                fontSize="10"
                fill="#7c3aed"
                fontWeight="600"
              >
                新路线: {truncate(stage.routeChange.updated, 10)}
              </text>
            </g>
          );
        })()}

        {/* 当前营地浮卡 (SVG 内嵌; 文案改: 正在学习 / Camp · 标题 / 任务 N 项) */}
        {(() => {
          const idx = six.findIndex((s) => s.status === "active");
          if (idx < 0) return null;
          const p = WAYPOINTS[idx];
          const stage = six[idx];
          const isRightSide = p.x > 850;
          const boxW = 196;
          const boxH = 64;
          const boxX = isRightSide ? p.x - boxW - 16 : p.x - boxW / 2;
          const boxY = p.y - 88;
          return (
            <g pointerEvents="none">
              {/* 阴影 */}
              <rect
                x={boxX + 2}
                y={boxY + 3}
                width={boxW}
                height={boxH}
                rx="12"
                fill="rgba(124, 58, 237, 0.22)"
              />
              {/* 主体 */}
              <rect
                x={boxX}
                y={boxY}
                width={boxW}
                height={boxH}
                rx="12"
                fill="var(--card-solid)"
                stroke="#a78bfa"
                strokeWidth="1.5"
              />
              {/* 指针 */}
              <path
                d={`M ${p.x - 7} ${boxY + boxH - 1}
                    L ${p.x + 7} ${boxY + boxH - 1}
                    L ${p.x} ${boxY + boxH + 10} Z`}
                fill="var(--card-solid)"
                stroke="#a78bfa"
                strokeWidth="1.5"
              />
              <path
                d={`M ${p.x - 6} ${boxY + boxH}
                    L ${p.x + 6} ${boxY + boxH}
                    L ${p.x} ${boxY + boxH + 8} Z`}
                fill="var(--card-solid)"
              />
              {/* L1: 正在学习 (小字 + 紫色) */}
              <text
                x={boxX + 14}
                y={boxY + 17}
                fontFamily="ui-sans-serif, system-ui"
                fontSize="10.5"
                fill="#7c3aed"
                fontWeight="600"
              >
                正在学习
              </text>
              {/* L2: Camp N · 标题 (大字 sans) */}
              <text
                x={boxX + 14}
                y={boxY + 36}
                fontFamily="ui-sans-serif, system-ui"
                fontSize="14"
                fill="var(--foreground)"
                fontWeight="700"
              >
                Camp {idx + 1} · {truncate(stage.title, 6)}
              </text>
              {/* L3: 任务 N 项 (小灰字) */}
              <text
                x={boxX + 14}
                y={boxY + 54}
                fontFamily="ui-sans-serif, system-ui"
                fontSize="11"
                fill="var(--muted-foreground)"
              >
                今日任务 {stage.taskCount ?? 3} 项 · 推进中
              </text>
            </g>
          );
        })()}

        {/* 顶峰标签 — 学习目标 */}
        <g transform={`translate(${PEAK.x - 40}, ${PEAK.y + 36})`}>
          <text
            x={0}
            y={0}
            fontFamily="ui-monospace, 'SF Mono', Menlo, Consolas, monospace"
            fontSize="11"
            fill="var(--foreground)"
            opacity="0.85"
            textAnchor="middle"
          >
            目标顶峰
          </text>
          {learningGoal ? (
            <text
              x={0}
              y={14}
              fontFamily="ui-sans-serif, system-ui"
              fontSize="10"
              fill="var(--muted-foreground)"
              textAnchor="middle"
            >
              {truncate(learningGoal, 18)}
            </text>
          ) : null}
        </g>

        {/* 左下角图例 + 指北针 */}
        <g transform="translate(30, 640)">
          <text
            fontFamily="ui-monospace, monospace"
            fontSize="10"
            fill="var(--muted-foreground)"
            opacity="0.7"
          >
            ◆ ZhiPath · 学习路径地形图   ·   N
          </text>
          <line x1="220" y1="-4" x2="220" y2="-12" stroke="#64748b" strokeWidth="1" />
          <path d="M 220 -16 L 216 -8 L 224 -8 Z" fill="#64748b" />
        </g>

        {/* 右下角比例尺 */}
        <g transform="translate(1010, 640)">
          <line x1="0" y1="0" x2="120" y2="0" stroke="#64748b" strokeWidth="1.5" />
          <line x1="0" y1="-4" x2="0" y2="4" stroke="#64748b" strokeWidth="1.5" />
          <line x1="60" y1="-3" x2="60" y2="3" stroke="#64748b" strokeWidth="1" />
          <line x1="120" y1="-4" x2="120" y2="4" stroke="#64748b" strokeWidth="1.5" />
          <text
            x={60}
            y={-8}
            fontFamily="ui-monospace, monospace"
            fontSize="9"
            fill="var(--muted-foreground)"
            opacity="0.75"
            textAnchor="middle"
          >
            ~ 1 阶段
          </text>
        </g>
      </svg>
    </div>
  );
}

function CampMarker({
  x,
  y,
  ordinal,
  status,
  title,
  onClick,
}: {
  x: number;
  y: number;
  ordinal: number;
  status: "done" | "active" | "pending";
  title: string;
  onClick?: () => void;
}) {
  const isActive = status === "active";
  const isDone = status === "done";

  const fillColor = isActive ? "#a78bfa" : isDone ? "#007AFF" : "#cbd5e1";
  const strokeColor = isActive ? "#7c3aed" : isDone ? "#1d4ed8" : "#94a3b8";

  return (
    <g
      style={{ cursor: onClick ? "pointer" : "default" }}
      onClick={onClick}
    >
      {/* 光晕 + 多圈 ripple (仅 active) */}
      {isActive ? (
        <>
          <motion.circle
            cx={x}
            cy={y}
            r="32"
            fill="url(#lf-flag-glow)"
            animate={{ scale: [1, 1.18, 1], opacity: [0.7, 1, 0.7] }}
            transition={{ duration: 2.2, repeat: Infinity }}
            style={{ transformOrigin: `${x}px ${y}px` }}
          />
          {[0, 0.7, 1.4].map((delay, i) => (
            <motion.circle
              key={i}
              cx={x}
              cy={y}
              r="18"
              fill="none"
              stroke="#a78bfa"
              strokeWidth="1.5"
              initial={{ opacity: 0.6, scale: 1 }}
              animate={{ opacity: [0.6, 0], scale: [1, 2.4] }}
              transition={{ duration: 2.1, delay, repeat: Infinity, ease: "easeOut" }}
              style={{ transformOrigin: `${x}px ${y}px` }}
            />
          ))}
        </>
      ) : null}

      {/* 帐篷三角形 (营地图标 — 当前 1.4x 放大) */}
      <g transform={`translate(${x}, ${y}) scale(${isActive ? 1.4 : 1})`}>
        <path
          d="M -12 6 L 0 -12 L 12 6 Z"
          fill={fillColor}
          stroke={strokeColor}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <line
          x1="-12"
          y1="6"
          x2="12"
          y2="6"
          stroke={strokeColor}
          strokeWidth="1.5"
          strokeLinecap="round"
        />

        {/* 已完成: 勾 */}
        {isDone ? (
          <path
            d="M -5 -2 L -1 2 L 6 -5"
            stroke="white"
            strokeWidth="1.8"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}

        {/* 当前: 紫红旗 */}
        {isActive ? (
          <g transform="translate(0, -16)">
            <line x1="0" y1="0" x2="0" y2="-20" stroke="#1e293b" strokeWidth="1.5" />
            <motion.path
              d="M 0 -20 L 14 -16 L 0 -12 Z"
              fill="#a78bfa"
              animate={{ rotate: [-2, 4, -2] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
              style={{ transformOrigin: "0px -18px" }}
            />
          </g>
        ) : null}
      </g>

      {/* 营地编号 + 名字 (放在帐篷下方; active 时下移留出放大空间) */}
      <g transform={`translate(${x}, ${y + (isActive ? 36 : 26)})`}>
        <text
          x={0}
          y={0}
          fontFamily="ui-monospace, 'SF Mono', Menlo, Consolas, monospace"
          fontSize="9"
          fill={isActive ? "#7c3aed" : isDone ? "#1d4ed8" : "#94a3b8"}
          textAnchor="middle"
          fontWeight={isActive ? 700 : 500}
        >
          {`Camp ${ordinal}`}
        </text>
        <text
          x={0}
          y={13}
          fontFamily="ui-sans-serif, system-ui"
          fontSize="11"
          fill={isActive ? "var(--foreground)" : "var(--muted-foreground)"}
          textAnchor="middle"
          fontWeight={isActive ? 600 : 400}
          opacity={status === "pending" ? 0.55 : 1}
        >
          {truncate(title, 10)}
        </text>
      </g>
    </g>
  );
}

function truncate(s: string, n: number): string {
  if (!s) return "";
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}
