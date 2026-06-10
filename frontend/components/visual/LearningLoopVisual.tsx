"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  Brain,
  CheckCircle2,
  FileText,
  Loader2,
  Play,
  Sparkles,
  Target,
  type LucideIcon,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type LoopStatus = "idle" | "ready" | "running" | "done";

interface LoopNode {
  id: string;
  label: string;
  caption: string;
  icon: LucideIcon;
  x: number;
  y: number;
}

interface LearningLoopVisualProps {
  activeStages?: string[];
  hasFeedback?: boolean;
  hasKnowledge?: boolean;
  hasProfile?: boolean;
  hasResource?: boolean;
  isStreaming?: boolean;
  onRun?: () => void;
}

const loopNodes: LoopNode[] = [
  { id: "intent", label: "目标", caption: "输入学习任务", icon: Target, x: 50, y: 12 },
  { id: "profile", label: "画像", caption: "识别基础与薄弱点", icon: Brain, x: 85, y: 37 },
  { id: "knowledge", label: "检索", caption: "召回知识依据", icon: BookOpen, x: 72, y: 78 },
  { id: "resource", label: "资源", caption: "生成题卷与卡片", icon: FileText, x: 28, y: 78 },
  { id: "feedback", label: "反馈", caption: "更新画像与补救", icon: CheckCircle2, x: 15, y: 37 },
];

const stageToNode: Record<string, string> = {
  building_profile: "profile",
  generating: "resource",
  goal_diagnosis: "intent",
  identifying_gaps: "profile",
  learning_plan: "resource",
  mapping_skills: "profile",
  resource_generation: "resource",
  scheduling_path: "resource",
  tutor_response: "knowledge",
};

// SVG 路径上的关键点 (用于沿路径动画)
const pathPoints: Record<string, { x: number; y: number }> = {
  intent: { x: 210, y: 48 },
  profile: { x: 338, y: 190 },
  knowledge: { x: 300, y: 258 },
  resource: { x: 116, y: 258 },
  feedback: { x: 82, y: 190 },
};

export function LearningLoopVisual({
  activeStages = [],
  hasFeedback = false,
  hasKnowledge = false,
  hasProfile = false,
  hasResource = false,
  isStreaming = false,
  onRun,
}: LearningLoopVisualProps) {
  const activeNodeId = useMemo(() => {
    if (!isStreaming) return "";
    const latestStage = activeStages[activeStages.length - 1];
    return stageToNode[latestStage] || "intent";
  }, [activeStages, isStreaming]);

  const [selectedId, setSelectedId] = useState(activeNodeId || "intent");

  useEffect(() => {
    if (activeNodeId) setSelectedId(activeNodeId);
  }, [activeNodeId]);

  useEffect(() => {
    if (isStreaming || activeNodeId) return;
    const timer = window.setInterval(() => {
      setSelectedId((current) => {
        const index = loopNodes.findIndex((node) => node.id === current);
        return loopNodes[(index + 1) % loopNodes.length].id;
      });
    }, 2600);
    return () => window.clearInterval(timer);
  }, [activeNodeId, isStreaming]);

  const selected = loopNodes.find((node) => node.id === selectedId) || loopNodes[0];
  const selectedStatus = getStatus(selected.id, {
    activeNodeId,
    hasFeedback,
    hasKnowledge,
    hasProfile,
    hasResource,
    isStreaming,
  });

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="mb-5 overflow-hidden rounded-[34px] border border-[rgba(0,122,255,0.18)] bg-[var(--card)] shadow-[var(--shadow-soft)] backdrop-blur"
    >
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_240px]">
        {/* SVG 循环图 */}
        <div className="relative min-h-[220px] overflow-hidden bg-[linear-gradient(145deg,rgba(0,122,255,0.075),rgba(255,255,255,0.74)_52%,rgba(52,199,89,0.045))] p-4">
          {/* 背景圆环 */}
          <motion.div
            className="absolute left-1/2 top-1/2 h-[210px] w-[210px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[rgba(0,122,255,0.08)]"
            animate={{ scale: [1, 1.03, 1] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          />
          <div className="absolute left-1/2 top-1/2 h-[150px] w-[150px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[rgba(60,60,67,0.06)]" />

          {/* SVG 路径 + 流动粒子 */}
          <svg viewBox="0 0 420 300" className="absolute inset-0 h-full w-full">
            <defs>
              <linearGradient id="lf-loop-gradient" x1="0" x2="1" y1="0" y2="1">
                <stop offset="0%" stopColor="rgba(0,122,255,0.72)" />
                <stop offset="50%" stopColor="rgba(90,200,250,0.62)" />
                <stop offset="100%" stopColor="rgba(52,199,89,0.52)" />
              </linearGradient>
            </defs>
            {/* 底层路径 */}
            <path
              d="M210 48 C315 54 370 118 338 190 C307 259 116 266 82 190 C50 118 105 54 210 48"
              fill="none"
              stroke="rgba(0,122,255,0.12)"
              strokeWidth="2"
            />
            {/* 流动路径 */}
            <motion.path
              d="M210 48 C315 54 370 118 338 190 C307 259 116 266 82 190 C50 118 105 54 210 48"
              fill="none"
              stroke="url(#lf-loop-gradient)"
              strokeLinecap="round"
              strokeWidth="3"
              strokeDasharray="34 210"
              animate={{ strokeDashoffset: [-244, 0] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "linear" }}
            />
          </svg>

          {/* 中心核心 */}
          <motion.div
            className="absolute left-1/2 top-1/2 flex h-[108px] w-[108px] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-[30px] border border-[var(--border)] bg-[var(--card)] text-center shadow-[0_18px_50px_rgba(0,122,255,0.14)]"
            animate={{ scale: [1, 1.06, 1] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
          >
            <div className="mb-1.5 flex h-9 w-9 items-center justify-center rounded-2xl bg-[rgba(0,122,255,0.1)] text-[var(--primary)]">
              <AnimatePresence mode="wait">
                {isStreaming ? (
                  <motion.div
                    key="loading"
                    initial={{ rotate: 0 }}
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  >
                    <Loader2 size={18} />
                  </motion.div>
                ) : (
                  <motion.div
                    key="idle"
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.8, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Sparkles size={18} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <div className="text-[12px] font-semibold">
              {isStreaming ? "正在处理" : "学习闭环"}
            </div>
            <div className="mt-0.5 text-[10px] text-[var(--muted-foreground)]">
              {isStreaming ? "保持上下文" : "持续迭代"}
            </div>
          </motion.div>

          {/* 5 个节点 */}
          {loopNodes.map((node) => {
            const status = getStatus(node.id, {
              activeNodeId,
              hasFeedback,
              hasKnowledge,
              hasProfile,
              hasResource,
              isStreaming,
            });
            const Icon = node.icon;
            const isSelected = selectedId === node.id;

            return (
              <motion.button
                key={node.id}
                type="button"
                onClick={() => setSelectedId(node.id)}
                initial={false}
                animate={{
                  scale: isSelected ? 1.05 : 1,
                  boxShadow: isSelected
                    ? "0 0 0 4px rgba(0,122,255,0.08), 0 8px 24px rgba(0,122,255,0.12)"
                    : status === "running"
                      ? "0 0 0 5px rgba(0,122,255,0.08), 0 12px 28px rgba(0,122,255,0.12)"
                      : "0 2px 8px rgba(0,0,0,0.04)",
                  borderColor: isSelected
                    ? "rgba(0,122,255,0.36)"
                    : "var(--border)",
                }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                className={`absolute flex h-[62px] w-[62px] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-[20px] border bg-[var(--card)] text-center backdrop-blur transition-colors ${
                  status === "running" ? "border-[rgba(0,122,255,0.3)]" : ""
                }`}
                style={{ left: `${node.x}%`, top: `${node.y}%` }}
                whileHover={{ scale: 1.08, y: -2 }}
                whileTap={{ scale: 0.97 }}
              >
                <motion.span
                  className={`mb-1 flex h-6 w-6 items-center justify-center rounded-xl ${
                    status === "done"
                      ? "bg-[rgba(52,199,89,0.14)] text-emerald-700"
                      : status === "running"
                        ? "bg-[rgba(0,122,255,0.12)] text-[var(--primary)]"
                        : status === "ready"
                          ? "bg-[rgba(255,149,0,0.14)] text-amber-700"
                          : "bg-[var(--muted)] text-[var(--muted-foreground)]"
                  }`}
                  animate={
                    status === "running"
                      ? { scale: [1, 1.15, 1] }
                      : {}
                  }
                  transition={
                    status === "running"
                      ? { duration: 1.6, repeat: Infinity, ease: "easeInOut" }
                      : {}
                  }
                >
                  <Icon size={13} />
                </motion.span>
                <span className="text-[10px] font-semibold leading-none">{node.label}</span>
              </motion.button>
            );
          })}
        </div>

        {/* 右侧信息面板 */}
        <div className="flex flex-col justify-between border-l border-[var(--border)] bg-[var(--card-solid)] p-4">
          <div>
            <div className="mb-2.5 inline-flex items-center gap-2 rounded-full bg-[rgba(0,122,255,0.09)] px-2.5 py-1 text-[12px] font-medium text-[var(--primary)]">
              <Sparkles size={13} />
              当前状态
            </div>
            <AnimatePresence mode="wait">
              <motion.div
                key={selected.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >
                <h3 className="text-[17px] font-semibold">{selected.label}</h3>
                <p className="mt-1.5 text-[12px] leading-5 text-[var(--muted-foreground)]">
                  {selected.caption}
                </p>
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            {[
              ["画像", hasProfile],
              ["资源", hasResource],
              ["反馈", hasFeedback],
            ].map(([label, done]) => (
              <motion.div
                key={label as string}
                className="rounded-2xl bg-[var(--muted)] px-3 py-2 text-center"
                whileHover={{ scale: 1.04 }}
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
              >
                <motion.div
                  className={`mx-auto mb-1 h-2 w-2 rounded-full ${done ? "bg-emerald-500" : "bg-[rgba(60,60,67,0.24)]"}`}
                  animate={done ? { scale: [1, 1.3, 1] } : {}}
                  transition={done ? { duration: 1.5, repeat: Infinity } : {}}
                />
                <div className="text-[11px] text-[var(--muted-foreground)]">{label}</div>
              </motion.div>
            ))}
          </div>

          {onRun && (
            <motion.button
              type="button"
              onClick={onRun}
              disabled={isStreaming}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--primary)] px-4 py-2.5 text-[13px] font-medium text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
              whileHover={{ scale: 1.02, boxShadow: "0 8px 24px rgba(0,122,255,0.25)" }}
              whileTap={{ scale: 0.98 }}
            >
              <Play size={15} />
              开始学习
            </motion.button>
          )}
        </div>
      </div>
    </motion.section>
  );
}

function getStatus(
  id: string,
  signal: {
    activeNodeId: string;
    hasFeedback: boolean;
    hasKnowledge: boolean;
    hasProfile: boolean;
    hasResource: boolean;
    isStreaming: boolean;
  },
): LoopStatus {
  if (signal.isStreaming && signal.activeNodeId === id) return "running";
  if (id === "intent" && (signal.hasProfile || signal.hasResource || signal.hasFeedback)) return "done";
  if (id === "profile" && signal.hasProfile) return "done";
  if (id === "knowledge" && signal.hasKnowledge) return "done";
  if (id === "resource" && signal.hasResource) return "done";
  if (id === "feedback" && signal.hasFeedback) return "done";
  if (id === "feedback" && signal.hasResource) return "ready";
  if (id === "resource" && (signal.hasProfile || signal.hasKnowledge)) return "ready";
  if (id === "knowledge" || id === "profile") return "ready";
  return "idle";
}
