"use client";

import { useMemo } from "react";
import {
  BarChart3,
  Brain,
  CheckCircle2,
  Code2,
  FileText,
  Layers3,
  Loader2,
  type LucideIcon,
  Network,
  Play,
  Radio,
  Route,
  Search,
  Share2,
  Sparkles,
  Target,
  TrendingUp,
  Volume2,
  Zap,
} from "lucide-react";
import type { AgentNodeState } from "@/context/ChatContext";

/* ── Agent 名称 → 步骤元数据 ── */

interface StepMeta {
  label: string;
  icon: LucideIcon;
  phase: string;
}

const STEP_META: Record<string, StepMeta> = {
  ProfileBuilder: { label: "画像分析", icon: Brain, phase: "准备阶段" },
  PathScheduler: { label: "路径编排", icon: Route, phase: "准备阶段" },
  GoalPlanner: { label: "目标诊断", icon: Target, phase: "诊断阶段" },
  SkillMapper: { label: "技能映射", icon: Share2, phase: "诊断阶段" },
  GapAnalyzer: { label: "差距定位", icon: BarChart3, phase: "诊断阶段" },
  QuizGenerator: { label: "练习题", icon: FileText, phase: "资源生成" },
  FlashcardGenerator: { label: "复习卡片", icon: Layers3, phase: "资源生成" },
  MindMapGenerator: { label: "思维导图", icon: Network, phase: "资源生成" },
  CodeLabGenerator: { label: "代码实操", icon: Code2, phase: "资源生成" },
  MermaidGenerator: { label: "结构图表", icon: BarChart3, phase: "资源生成" },
  KGGenerator: { label: "知识图谱", icon: Share2, phase: "资源生成" },
  ExplainerAgent: { label: "动画讲解", icon: Play, phase: "资源生成" },
  ExamStore: { label: "试卷组装", icon: FileText, phase: "后处理" },
  MasteryStore: { label: "掌握度更新", icon: TrendingUp, phase: "后处理" },
  iFlytekTTS: { label: "语音合成", icon: Volume2, phase: "后处理" },
};

/* 预期步骤（用于资源生成流水线，按 phase 排列） */
const EXPECTED_RESOURCE_STEPS = [
  "ProfileBuilder",
  "QuizGenerator",
  "FlashcardGenerator",
  "MindMapGenerator",
  "CodeLabGenerator",
  "MermaidGenerator",
  "KGGenerator",
];

const PHASE_ORDER = ["准备阶段", "诊断阶段", "资源生成", "后处理"];

interface PipelineStep {
  agentName: string;
  label: string;
  icon: LucideIcon;
  phase: string;
  status: AgentNodeState["status"] | "pending";
  inputSummary: string;
  outputSummary: string;
  startTime: number;
  endTime: number;
}

interface GenerationPipelineProps {
  agentNodes: Record<string, AgentNodeState>;
  isStreaming: boolean;
  activeCapability: string;
  compact?: boolean;
}

/**
 * 多智能体资源生成流水线：实时展示每个 Agent 的执行状态、耗时和输出摘要。
 * 直接回应比赛"生成进度追踪/流式呈现"硬指标。
 */
export function GenerationPipeline({
  agentNodes,
  isStreaming,
  activeCapability,
  compact = false,
}: GenerationPipelineProps) {
  const steps = useMemo(() => {
    const isResourceGen =
      activeCapability === "resource_gen" ||
      activeCapability === "auto_tutor" ||
      activeCapability === "agentic";

    /* 资源生成模式下，补齐预期但尚未调用的步骤 */
    if (isResourceGen) {
      const present = new Set(Object.keys(agentNodes));
      const merged: PipelineStep[] = [];

      /* 先加所有预期步骤 */
      for (const name of EXPECTED_RESOURCE_STEPS) {
        const meta = STEP_META[name] ?? {
          label: name,
          icon: Zap,
          phase: "资源生成",
        };
        const node = agentNodes[name];
        merged.push({
          agentName: name,
          label: meta.label,
          icon: meta.icon,
          phase: meta.phase,
          status: node?.status ?? "pending",
          inputSummary: node?.inputSummary ?? "",
          outputSummary: node?.outputSummary ?? "",
          startTime: node?.startTime ?? 0,
          endTime: node?.endTime ?? 0,
        });
      }

      /* 再加不在预期列表里的 agent（如 iFlytekTTS、ExamStore） */
      for (const [name, node] of Object.entries(agentNodes)) {
        if (present.has(name) && !EXPECTED_RESOURCE_STEPS.includes(name)) {
          const meta = STEP_META[name] ?? {
            label: name,
            icon: Zap,
            phase: "后处理",
          };
          merged.push({
            agentName: name,
            label: meta.label,
            icon: meta.icon,
            phase: meta.phase,
            status: node.status,
            inputSummary: node.inputSummary,
            outputSummary: node.outputSummary,
            startTime: node.startTime,
            endTime: node.endTime,
          });
        }
      }

      return merged.sort(
        (a, b) =>
          PHASE_ORDER.indexOf(a.phase) - PHASE_ORDER.indexOf(b.phase) ||
          a.startTime - b.startTime,
      );
    }

    /* 非资源生成模式，只展示已调用的 agent */
    return Object.entries(agentNodes)
      .map(([name, node]) => {
        const meta = STEP_META[name] ?? {
          label: name,
          icon: Zap,
          phase: "执行",
        };
        return {
          agentName: name,
          label: meta.label,
          icon: meta.icon,
          phase: meta.phase,
          status: node.status,
          inputSummary: node.inputSummary,
          outputSummary: node.outputSummary,
          startTime: node.startTime,
          endTime: node.endTime,
        } satisfies PipelineStep;
      })
      .sort((a, b) => a.startTime - b.startTime);
  }, [agentNodes, activeCapability]);

  const doneCount = steps.filter((s) => s.status === "done").length;
  const runningCount = steps.filter((s) => s.status === "running").length;
  const totalCount = steps.length;
  const progressPct = totalCount > 0 ? (doneCount / totalCount) * 100 : 0;

  /* 按阶段分组 */
  const grouped = useMemo(() => {
    const map = new Map<string, PipelineStep[]>();
    for (const step of steps) {
      if (!map.has(step.phase)) map.set(step.phase, []);
      map.get(step.phase)!.push(step);
    }
    return map;
  }, [steps]);

  if (totalCount === 0 && !isStreaming) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Sparkles size={24} className="text-[var(--muted-foreground)]" />
        <p className="mt-3 text-[12px] text-[var(--muted-foreground)]">
          选择能力并发送学习目标后，<br />
          这里会实时展示每个 Agent 的协作过程。
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 总进度条 */}
      <div className="rounded-xl bg-[var(--muted)] px-3 py-2.5">
        <div className="mb-1.5 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[12px] font-semibold">
            <Radio
              size={13}
              className={runningCount > 0 ? "animate-pulse text-[var(--primary)]" : "text-[var(--muted-foreground)]"}
            />
            {isStreaming ? "智能体协作中" : doneCount > 0 ? "协作完成" : "等待任务"}
          </div>
          <span className="text-[11px] text-[var(--muted-foreground)]">
            {doneCount}/{totalCount} 步完成
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-[var(--border)]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[var(--primary)] to-[#34c759] transition-all duration-700 ease-out"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* 按阶段分组的步骤列表 */}
      {Array.from(grouped.entries()).map(([phase, phaseSteps]) => (
        <div key={phase}>
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
            {phase}
          </div>
          <div className={compact ? "space-y-1.5" : "space-y-2"}>
            {phaseSteps.map((step) => (
              <StepRow key={step.agentName} step={step} compact={compact} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── 单个步骤行 ── */

function StepRow({ step, compact }: { step: PipelineStep; compact: boolean }) {
  const Icon = step.icon;
  const duration =
    step.endTime > 0 && step.startTime > 0
      ? ((step.endTime - step.startTime) / 1000).toFixed(1)
      : null;

  return (
    <div
      className={`lf-pipeline-step rounded-xl border transition-all duration-300 ${
        step.status === "running"
          ? "border-[rgba(0,122,255,0.35)] bg-[rgba(0,122,255,0.06)] shadow-[0_0_0_3px_rgba(0,122,255,0.08)]"
          : step.status === "done"
            ? "border-[rgba(52,199,89,0.25)] bg-[var(--card)]"
            : step.status === "error"
              ? "border-[rgba(255,59,48,0.3)] bg-[rgba(255,59,48,0.04)]"
              : "border-[var(--border)] bg-[var(--card)]"
      } ${compact ? "px-2.5 py-2" : "px-3 py-2.5"}`}
    >
      <div className="flex items-center gap-2.5">
        {/* 状态图标 */}
        <div
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
            step.status === "running"
              ? "bg-[rgba(0,122,255,0.12)] text-[var(--primary)]"
              : step.status === "done"
                ? "bg-[rgba(52,199,89,0.12)] text-emerald-600 dark:text-emerald-400"
                : step.status === "error"
                  ? "bg-[rgba(255,59,48,0.1)] text-red-500"
                  : "bg-[var(--muted)] text-[var(--muted-foreground)]"
          }`}
        >
          {step.status === "running" ? (
            <Loader2 size={14} className="animate-spin" />
          ) : step.status === "done" ? (
            <CheckCircle2 size={14} />
          ) : step.status === "error" ? (
            <span className="text-[11px]">✕</span>
          ) : (
            <Icon size={14} />
          )}
        </div>

        {/* 标签 + 摘要 */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-semibold text-[var(--foreground)]">
              {step.label}
            </span>
            {duration ? (
              <span className="text-[10px] text-[var(--muted-foreground)]">
                {duration}s
              </span>
            ) : null}
          </div>
          {!compact && (step.outputSummary || step.inputSummary) ? (
            <p className="mt-0.5 truncate text-[11px] leading-4 text-[var(--muted-foreground)]">
              {step.status === "done" && step.outputSummary
                ? step.outputSummary
                : step.status === "running" && step.inputSummary
                  ? step.inputSummary
                  : ""}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
