"use client";

import { useMemo, useState } from "react";
import {
  AlertCircle,
  Activity,
  Boxes,
  Brain,
  CheckCircle2,
  Clock3,
  Database,
  Loader2,
  Network,
  Route,
  Target,
  type LucideIcon,
} from "lucide-react";
import type { AgentNodeState } from "@/context/ChatContext";

type NodeStatus = "idle" | "running" | "done" | "error";

interface WorkflowNode {
  id: string;
  label: string;
  caption: string;
  icon: LucideIcon;
  x: number;
  y: number;
}

interface AgentWorkflowGraphProps {
  activeStages?: string[];
  agentNodes?: Record<string, AgentNodeState>;
  compact?: boolean;
  hasFeedback?: boolean;
  hasKnowledge?: boolean;
  hasProfile?: boolean;
  hasResource?: boolean;
  isStreaming?: boolean;
}

const nodes: WorkflowNode[] = [
  {
    id: "orchestrator",
    label: "Orchestrator",
    caption: "任务调度",
    icon: Network,
    x: 50,
    y: 12,
  },
  {
    id: "knowledge",
    label: "RAG",
    caption: "知识依据",
    icon: Database,
    x: 18,
    y: 38,
  },
  {
    id: "profile",
    label: "画像",
    caption: "学情识别",
    icon: Brain,
    x: 50,
    y: 38,
  },
  {
    id: "path",
    label: "路径",
    caption: "阶段规划",
    icon: Route,
    x: 82,
    y: 38,
  },
  {
    id: "resource",
    label: "资源",
    caption: "题卷卡片",
    icon: Boxes,
    x: 34,
    y: 72,
  },
  {
    id: "feedback",
    label: "反馈",
    caption: "补救迭代",
    icon: Target,
    x: 66,
    y: 72,
  },
];

const edges = [
  ["orchestrator", "knowledge"],
  ["orchestrator", "profile"],
  ["orchestrator", "path"],
  ["knowledge", "resource"],
  ["profile", "resource"],
  ["path", "resource"],
  ["resource", "feedback"],
  ["feedback", "profile"],
] as const;

export function AgentWorkflowGraph({
  activeStages = [],
  agentNodes = {},
  compact = false,
  hasFeedback = false,
  hasKnowledge = false,
  hasProfile = false,
  hasResource = false,
  isStreaming = false,
}: AgentWorkflowGraphProps) {
  const status = (id: string): NodeStatus =>
    resolveStatus(id, {
      activeStages,
      agentNodes,
      hasFeedback,
      hasKnowledge,
      hasProfile,
      hasResource,
      isStreaming,
    });
  const running = nodes.some((node) => status(node.id) === "running");
  const [selectedId, setSelectedId] = useState("orchestrator");
  const selectedNode = nodes.find((node) => node.id === selectedId) || nodes[0];
  const selectedDetail = useMemo(
    () => buildNodeDetail(selectedNode.id, agentNodes),
    [agentNodes, selectedNode.id],
  );
  const timelineEvents = useMemo(
    () => buildTimelineEvents(agentNodes, activeStages),
    [activeStages, agentNodes],
  );

  return (
    <div
      className={`relative overflow-hidden rounded-[28px] border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow-soft)] ${
        compact ? "h-[250px] p-4" : "h-[480px] p-5"
      }`}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_10%,rgba(0,122,255,0.08),transparent_18rem)]" />
      <div className="relative z-10 flex items-center justify-between">
        <div>
          <div className="text-[14px] font-semibold">多智能体协作链路</div>
          <div className="mt-0.5 text-[12px] text-[var(--muted-foreground)]">
            {running ? "正在调度多个 Agent" : timelineEvents.length ? "本轮链路已记录" : "等待学习任务输入"}
          </div>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
            running
              ? "bg-[rgba(0,122,255,0.1)] text-[var(--primary)]"
              : "bg-[var(--muted)] text-[var(--muted-foreground)]"
          }`}
        >
          {running ? "运行中" : "就绪"}
        </span>
      </div>

      <div className={`absolute inset-x-4 top-16 ${compact ? "bottom-4" : "bottom-[168px]"}`}>
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          {edges.map(([from, to]) => {
            const source = nodes.find((node) => node.id === from);
            const target = nodes.find((node) => node.id === to);
            if (!source || !target) return null;
            const isActive = status(from) === "running" || status(to) === "running";
            const isError = status(from) === "error" || status(to) === "error";
            const isDone = status(from) === "done" && status(to) !== "idle";
            const path = edgePath(source, target);
            return (
              <g key={`${from}-${to}`}>
                <path
                  d={path}
                  fill="none"
                  className={
                    isError
                      ? "lf-agent-edge-error"
                      : isActive
                        ? "lf-agent-edge-active"
                        : isDone
                          ? "lf-agent-edge-done"
                          : "lf-agent-edge"
                  }
                />
                {isActive && (
                  <circle r={compact ? "0.7" : "0.9"} fill="rgba(0,122,255,0.86)">
                    <animateMotion dur="1.45s" path={path} repeatCount="indefinite" />
                  </circle>
                )}
              </g>
            );
          })}
        </svg>

        {nodes.map((node) => (
          <AgentNode
            key={node.id}
            compact={compact}
            node={node}
            onSelect={() => setSelectedId(node.id)}
            selected={selectedId === node.id}
            status={status(node.id)}
          />
        ))}
      </div>

      {!compact && (
        <div className="absolute bottom-5 left-5 right-5 z-10 grid gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3 shadow-sm backdrop-blur xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="rounded-xl bg-[var(--muted)] px-3 py-2.5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[13px] font-semibold">{selectedNode.label}</div>
                <div className="mt-1 text-[12px] leading-5 text-[var(--muted-foreground)]">
                  {selectedDetail}
                </div>
              </div>
              <StatusBadge status={status(selectedNode.id)} />
            </div>
          </div>
          <div className="rounded-xl bg-[var(--muted)] px-3 py-2.5">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[12px] font-semibold">
                <Activity size={13} className="text-[var(--primary)]" />
                事件轨迹
              </div>
              <span className="text-[10px] text-[var(--muted-foreground)]">
                {timelineEvents.length} 条
              </span>
            </div>
            <div className="space-y-1.5">
              {(timelineEvents.length ? timelineEvents : [{ label: "等待任务", detail: "发送学习目标后开始记录", status: "idle" as NodeStatus }])
                .slice(0, 4)
                .map((event, index) => (
                  <div key={`${event.label}-${index}`} className="flex items-center gap-2 rounded-lg bg-[var(--card-solid)] px-2 py-1.5">
                    <StatusDot status={event.status} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[11px] font-medium">{event.label}</div>
                      <div className="truncate text-[10px] text-[var(--muted-foreground)]">{event.detail}</div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
          <span className="absolute right-3 top-[-28px] rounded-full bg-[var(--card)] px-2 py-1 text-[10px] text-[var(--muted-foreground)] shadow-sm">
            点击节点查看详情
          </span>
        </div>
      )}
    </div>
  );
}

function AgentNode({
  compact,
  node,
  onSelect,
  selected,
  status,
}: {
  compact: boolean;
  node: WorkflowNode;
  onSelect: () => void;
  selected: boolean;
  status: NodeStatus;
}) {
  const Icon = node.icon;
  const statusClass = {
    done: "border-[rgba(52,199,89,0.35)] bg-[var(--card-solid)] text-emerald-700 dark:text-emerald-400",
    error: "border-red-200 dark:border-red-800 bg-[var(--card-solid)] text-red-600 dark:text-red-400",
    idle: "border-[var(--border)] bg-[var(--card-solid)] text-[var(--muted-foreground)]",
    running: "lf-agent-node-running border-[rgba(0,122,255,0.4)] bg-[var(--card-solid)] text-[var(--primary)]",
  }[status];

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-2xl border shadow-sm backdrop-blur ${statusClass} ${
        compact ? "w-[74px] px-2 py-2" : "w-[104px] px-3 py-2.5"
      } ${selected ? "ring-2 ring-[rgba(0,122,255,0.28)]" : ""}`}
      style={{ left: `${node.x}%`, top: `${node.y}%` }}
    >
      <div className="flex items-center justify-center gap-1.5">
        {status === "done" ? (
          <CheckCircle2 size={compact ? 13 : 15} />
        ) : status === "running" ? (
          <Loader2 size={compact ? 13 : 15} className="animate-spin" />
        ) : status === "error" ? (
          <AlertCircle size={compact ? 13 : 15} />
        ) : (
          <Icon size={compact ? 13 : 15} />
        )}
        <span className="truncate text-[12px] font-semibold">{node.label}</span>
      </div>
      {!compact && (
        <div className="mt-1 truncate text-center text-[10px] text-[var(--muted-foreground)]">
          {status === "running" ? "运行中" : status === "done" ? "已完成" : status === "error" ? "异常" : node.caption}
        </div>
      )}
    </button>
  );
}

function StatusBadge({ status }: { status: NodeStatus }) {
  const label = status === "done" ? "已完成" : status === "running" ? "运行中" : status === "error" ? "异常" : "待处理";
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-medium ${
        status === "done"
          ? "bg-[rgba(52,199,89,0.12)] text-emerald-700"
          : status === "running"
            ? "bg-[rgba(0,122,255,0.1)] text-[var(--primary)]"
            : status === "error"
              ? "bg-red-50 text-red-600"
              : "bg-[var(--muted)] text-[var(--muted-foreground)]"
      }`}
    >
      {label}
    </span>
  );
}

function StatusDot({ status }: { status: NodeStatus }) {
  return (
    <span
      className={`h-2 w-2 shrink-0 rounded-full ${
        status === "done"
          ? "bg-emerald-500"
          : status === "running"
            ? "animate-pulse bg-[var(--primary)]"
            : status === "error"
              ? "bg-red-500"
              : "bg-[rgba(60,60,67,0.25)]"
      }`}
    />
  );
}

function edgePath(source: WorkflowNode, target: WorkflowNode) {
  const midY = (source.y + target.y) / 2;
  return `M ${source.x} ${source.y} C ${source.x} ${midY}, ${target.x} ${midY}, ${target.x} ${target.y}`;
}

function resolveStatus(
  id: string,
  signal: Required<Omit<AgentWorkflowGraphProps, "compact">>,
): NodeStatus {
  const stageText = signal.activeStages.join(" ").toLowerCase();
  const agentText = Object.entries(signal.agentNodes)
    .map(([name, node]) => `${name} ${node.status}`)
    .join(" ")
    .toLowerCase();

  const runningByAgent = (patterns: string[]) =>
    patterns.some((pattern) => agentText.includes(pattern.toLowerCase()) && agentText.includes("running"));
  const runningByStage = (patterns: string[]) =>
    patterns.some((pattern) => stageText.includes(pattern.toLowerCase()));
  const errorByAgent = (patterns: string[]) =>
    patterns.some((pattern) => agentText.includes(pattern.toLowerCase()) && agentText.includes("error"));

  if (id === "orchestrator") {
    if (signal.isStreaming) return "running";
    if (signal.hasProfile || signal.hasResource || signal.hasFeedback) return "done";
  }

  if (id === "knowledge") {
    if (runningByStage(["retrieval", "knowledge", "resource_generation"])) return "running";
    if (signal.hasKnowledge) return "done";
  }

  if (id === "profile") {
    if (errorByAgent(["ProfileBuilder"])) return "error";
    if (runningByAgent(["ProfileBuilder"]) || runningByStage(["profile", "goal", "learning_analysis"])) return "running";
    if (signal.hasProfile || signal.hasFeedback) return "done";
  }

  if (id === "path") {
    if (errorByAgent(["PathScheduler"])) return "error";
    if (runningByAgent(["PathScheduler"]) || runningByStage(["path", "learning_plan", "scheduling"])) return "running";
    if (signal.hasProfile) return "done";
  }

  if (id === "resource") {
    if (errorByAgent(["QuizGenerator", "FlashcardGenerator", "MindMapGenerator"])) return "error";
    if (runningByAgent(["QuizGenerator", "FlashcardGenerator", "MindMapGenerator"]) || runningByStage(["resource", "generating"])) {
      return "running";
    }
    if (signal.hasResource) return "done";
  }

  if (id === "feedback") {
    if (signal.hasResource && !signal.hasFeedback) return "running";
    if (signal.hasFeedback) return "done";
  }

  return "idle";
}

function buildTimelineEvents(
  agentNodes: Record<string, AgentNodeState>,
  activeStages: string[],
) {
  const agentEvents = Object.values(agentNodes).map((node) => ({
    detail: node.outputSummary || node.inputSummary || statusLabel(node.status),
    label: readableAgentName(node.name),
    order: node.endTime || node.startTime || 0,
    status: node.status === "error" ? "error" as const : node.status === "running" ? "running" as const : node.status === "done" ? "done" as const : "idle" as const,
  }));
  const stageEvents = activeStages.map((stage, index) => ({
    detail: "当前执行阶段",
    label: readableStageName(stage),
    order: Date.now() + index,
    status: "running" as const,
  }));
  return [...stageEvents, ...agentEvents]
    .sort((a, b) => b.order - a.order)
    .map(({ detail, label, status }) => ({
      detail: trimText(detail, 42),
      label,
      status,
    }));
}

function readableAgentName(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes("profile")) return "画像构建";
  if (lower.includes("path")) return "路径规划";
  if (lower.includes("quiz")) return "测验生成";
  if (lower.includes("flash")) return "卡片生成";
  if (lower.includes("mind")) return "结构生成";
  return name;
}

function readableStageName(stage: string) {
  const map: Record<string, string> = {
    building_profile: "画像更新",
    generating: "资源生成",
    goal_diagnosis: "目标诊断",
    learning_plan: "路径规划",
    mapping_skills: "能力映射",
    resource_generation: "资源构建",
    scheduling_path: "路径编排",
    tutor_response: "导学讲解",
  };
  return map[stage] || stage;
}

function statusLabel(status: AgentNodeState["status"]) {
  if (status === "done") return "执行完成";
  if (status === "running") return "正在执行";
  if (status === "error") return "执行异常";
  return "等待调用";
}

function trimText(value: string, max: number) {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}...`;
}

function buildNodeDetail(
  id: string,
  agentNodes: Record<string, AgentNodeState>,
): string {
  const agentEntries = Object.entries(agentNodes);
  const findAgent = (patterns: string[]) =>
    agentEntries.find(([name]) =>
      patterns.some((pattern) => name.toLowerCase().includes(pattern.toLowerCase())),
    )?.[1];

  if (id === "orchestrator") {
    return "接收学生输入，判断任务意图，并把请求分发给目标诊断、画像、路径和资源生成能力。";
  }
  if (id === "knowledge") {
    return "从知识库召回上下文，优先使用 pgvector 语义检索，作为后续讲解和资源生成依据。";
  }
  if (id === "profile") {
    const node = findAgent(["ProfileBuilder"]);
    return node?.outputSummary || node?.inputSummary || "从对话与测验反馈中提取学习目标、水平、薄弱点和偏好。";
  }
  if (id === "path") {
    const node = findAgent(["PathScheduler"]);
    return node?.outputSummary || node?.inputSummary || "根据画像生成阶段目标、学习任务和验收标准。";
  }
  if (id === "resource") {
    const node = findAgent(["QuizGenerator", "FlashcardGenerator", "MindMapGenerator"]);
    return node?.outputSummary || node?.inputSummary || "并行生成测验题、复习卡片、知识结构和可打印资源包。";
  }
  return "根据答题结果计算正确率、定位错因，并把薄弱点回写到画像，驱动下一轮补救。";
}
