"use client";

import { useMemo } from "react";
import { useChat } from "@/context/ChatContext";

const STEPS = [
  { key: "diagnose", label: "目标诊断", angle: -90 },
  { key: "generate", label: "并行生成", angle: -36 },
  { key: "exam", label: "试卷封装", angle: 18 },
  { key: "self_assess", label: "模拟自评", angle: 72 },
  { key: "update_profile", label: "画像更新", angle: 126 },
  { key: "reschedule", label: "路径重规划", angle: 180 },
  { key: "report", label: "闭环报告", angle: 234 },
];

/**
 * Auto-Tutor 闭环可视化：根据 ChatContext 中收到的 LOOP_STEP 事件
 * 高亮当前正在跑的阶段，已完成的阶段绿色 tick。是评委演示重点。
 */
export function AutoTutorLoopVisual() {
  const { state } = useChat();

  const stepStatus = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of state.loopSteps) map.set(s.step, s.status);
    return map;
  }, [state.loopSteps]);

  const lastStep = state.loopSteps.length
    ? state.loopSteps[state.loopSteps.length - 1].step
    : "";

  const center = 130;
  const radius = 96;

  return (
    <div className="relative rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-5 shadow-sm">
      <header className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">🚀 Auto-Tutor 学习闭环</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            诊断 → 生成 → 自评 → 画像更新 → 重规划，多智能体协作走完整套
          </p>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
            state.isStreaming
              ? "bg-blue-50 text-blue-700"
              : state.loopSteps.length
                ? "bg-emerald-50 text-emerald-700"
                : "bg-slate-100 text-slate-500"
          }`}
        >
          {state.isStreaming ? "闭环执行中" : state.loopSteps.length ? "闭环已完成" : "未触发"}
        </span>
      </header>

      <div className="relative mx-auto h-[260px] w-[260px]">
        <svg viewBox="0 0 260 260" className="absolute inset-0 h-full w-full">
          <circle cx={center} cy={center} r={radius} fill="none" stroke="#e2e8f0" strokeWidth="1.5" strokeDasharray="4 4" />
          {STEPS.map((step, idx) => {
            const next = STEPS[(idx + 1) % STEPS.length];
            const from = polar(center, center, radius, step.angle);
            const to = polar(center, center, radius, next.angle);
            const status = stepStatus.get(step.key) ?? "pending";
            const running = status === "running" || lastStep === step.key && state.isStreaming;
            return (
              <line
                key={`edge-${step.key}`}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke={running ? "#0ea5e9" : status === "done" ? "#10b981" : "#cbd5e1"}
                strokeWidth={running ? 3 : 1.5}
                opacity={running ? 0.85 : 0.6}
              />
            );
          })}
          {STEPS.map((step) => {
            const status = stepStatus.get(step.key) ?? "pending";
            const running = status === "running" || lastStep === step.key && state.isStreaming;
            const done = status === "done";
            const { x, y } = polar(center, center, radius, step.angle);
            const fill = running
              ? "#0ea5e9"
              : done
                ? "#10b981"
                : "#fff";
            const stroke = done ? "#10b981" : running ? "#0ea5e9" : "#cbd5e1";
            return (
              <g key={step.key}>
                <circle cx={x} cy={y} r={running ? 11 : 9} fill={fill} stroke={stroke} strokeWidth="2">
                  {running ? (
                    <animate attributeName="r" values="9;13;9" dur="1.4s" repeatCount="indefinite" />
                  ) : null}
                </circle>
                {done ? (
                  <path
                    d={`M ${x - 4} ${y} l 3 3 l 6 -6`}
                    stroke="#fff"
                    strokeWidth="2"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ) : null}
              </g>
            );
          })}
        </svg>

        {STEPS.map((step) => {
          const { x, y } = polar(center, center, radius + 22, step.angle);
          const status = stepStatus.get(step.key) ?? "pending";
          return (
            <span
              key={`label-${step.key}`}
              className={`absolute whitespace-nowrap text-[11px] font-medium ${
                status === "done"
                  ? "text-emerald-700"
                  : status === "running"
                    ? "text-sky-700"
                    : "text-slate-400"
              }`}
              style={{
                left: x,
                top: y,
                transform: "translate(-50%, -50%)",
              }}
            >
              {step.label}
            </span>
          );
        })}

        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center">
          <span className="block text-xs text-slate-400">当前阶段</span>
          <span className="mt-1 block text-sm font-semibold text-slate-800">
            {lastStep
              ? STEPS.find((s) => s.key === lastStep)?.label ?? lastStep
              : "等待触发"}
          </span>
        </div>
      </div>
    </div>
  );
}

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}
