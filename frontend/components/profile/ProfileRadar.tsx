"use client";

import type { LearningProfile } from "@/lib/api";

interface RadarAxis {
  label: string;
  value: number;
}

export function ProfileRadar({ profile }: { profile: LearningProfile }) {
  const axes = buildAxes(profile);
  const points = axes.map((axis, index) => polarPoint(index, axes.length, axis.value));
  const polygon = points.map((point) => `${point.x},${point.y}`).join(" ");
  const rings = [20, 40, 60, 80, 100];

  return (
    <div className="rounded-[28px] border border-[var(--border)] bg-white/86 p-5 shadow-[var(--shadow-soft)]">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-[14px] font-semibold">画像雷达</div>
          <div className="mt-0.5 text-[12px] text-[var(--muted-foreground)]">
            展示画像信号强度，不作为考试分数。
          </div>
        </div>
        <span className="rounded-full bg-[rgba(0,122,255,0.08)] px-2.5 py-1 text-[11px] font-medium text-[var(--primary)]">
          {Math.round(axes.reduce((sum, axis) => sum + axis.value, 0) / axes.length)}%
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-[260px_minmax(0,1fr)] md:items-center">
        <svg viewBox="0 0 220 220" className="mx-auto h-[240px] w-[240px] max-w-full">
          {rings.map((ring) => {
            const ringPoints = axes
              .map((_, index) => polarPoint(index, axes.length, ring))
              .map((point) => `${point.x},${point.y}`)
              .join(" ");
            return (
              <polygon
                key={ring}
                points={ringPoints}
                fill="none"
                stroke="rgba(60,60,67,0.12)"
                strokeWidth="1"
              />
            );
          })}
          {axes.map((axis, index) => {
            const end = polarPoint(index, axes.length, 100);
            const labelPoint = polarPoint(index, axes.length, 116);
            return (
              <g key={axis.label}>
                <line x1="110" y1="110" x2={end.x} y2={end.y} stroke="rgba(60,60,67,0.12)" />
                <text
                  x={labelPoint.x}
                  y={labelPoint.y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="fill-[var(--muted-foreground)] text-[9px]"
                >
                  {axis.label}
                </text>
              </g>
            );
          })}
          <polygon
            points={polygon}
            fill="rgba(0,122,255,0.16)"
            stroke="rgba(0,122,255,0.88)"
            strokeWidth="2"
          />
          {points.map((point, index) => (
            <circle
              key={axes[index].label}
              cx={point.x}
              cy={point.y}
              r="3.2"
              fill="white"
              stroke="rgba(0,122,255,0.9)"
              strokeWidth="2"
            />
          ))}
        </svg>

        <div className="space-y-3">
          {axes.map((axis) => (
            <div key={axis.label}>
              <div className="mb-1 flex items-center justify-between text-[12px]">
                <span className="text-[var(--muted-foreground)]">{axis.label}</span>
                <span className="font-medium">{axis.value}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-[var(--muted)]">
                <div
                  className="h-1.5 rounded-full bg-[var(--primary)]"
                  style={{ width: `${axis.value}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function buildAxes(profile: LearningProfile): RadarAxis[] {
  return [
    { label: "目标", value: profile.learning_goal ? 88 : 28 },
    { label: "主题", value: Math.min(92, 28 + profile.topics.length * 14) },
    { label: "弱项", value: Math.min(92, 24 + profile.weak_points.length * 18) },
    { label: "偏好", value: Math.min(88, 22 + profile.preferences.length * 18) },
    {
      label: "反馈",
      value:
        typeof profile.quiz_accuracy === "number"
          ? Math.min(94, 42 + Math.round(profile.quiz_accuracy * 52))
          : profile.turn_count > 2
            ? 48
            : 24,
    },
    { label: "约束", value: Math.min(86, 20 + profile.constraints.length * 20) },
  ];
}

function polarPoint(index: number, total: number, value: number) {
  const radius = value * 0.82;
  const angle = -Math.PI / 2 + (Math.PI * 2 * index) / total;
  return {
    x: 110 + Math.cos(angle) * radius,
    y: 110 + Math.sin(angle) * radius,
  };
}
