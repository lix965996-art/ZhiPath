"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  BarChart3,
  BookOpen,
  Boxes,
  Brain,
  CalendarDays,
  Compass,
  GraduationCap,
  LayoutDashboard,
  Library,
  Menu,
  MessageSquare,
  PanelRight,
  PenLine,
  Rocket,
  Route,
  Settings,
  Sparkles,
  Target,
  UserRound,
  Wand2,
} from "lucide-react";
import { BrandMark } from "@/components/brand/BrandMark";
import { ChatProvider, useChat } from "@/context/ChatContext";
import {
  apiUrl,
  apiFetch,
  getLearningProfile,
  listKnowledgeDocuments,
  type KnowledgeDocumentSummary,
  type LearningProfile,
} from "@/lib/api";
// 重量级组件 → 懒加载，不阻塞首屏和路由切换
const AgentWorkflowGraph = dynamic(() => import("@/components/agent/AgentWorkflowGraph").then(m => ({ default: m.AgentWorkflowGraph })), { ssr: false, loading: () => null });
const AgentMessageFeed = dynamic(() => import("@/components/agent/AgentMessageFeed").then(m => ({ default: m.AgentMessageFeed })), { ssr: false, loading: () => null });
const AutoTutorLoopVisual = dynamic(() => import("@/components/visual/AutoTutorLoopVisual").then(m => ({ default: m.AutoTutorLoopVisual })), { ssr: false, loading: () => null });
const ProfileEvidencePanel = dynamic(() => import("@/components/profile/ProfileEvidencePanel").then(m => ({ default: m.ProfileEvidencePanel })), { ssr: false, loading: () => null });
const RightTabPanel = dynamic(() => import("@/components/chat/RightTabPanel").then(m => ({ default: m.RightTabPanel })), { ssr: false, loading: () => null });
const PomodoroTimer = dynamic(() => import("@/components/pomodoro/PomodoroTimer").then(m => ({ default: m.PomodoroTimer })), { ssr: false, loading: () => null });
import { SettingsButton } from "@/components/settings/SettingsButton";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { RoleSwitcher } from "@/components/role/RoleSwitcher";
import { useRole } from "@/context/RoleContext";
const ContestDemoPanel = dynamic(() => import("@/components/demo/ContestDemoPanel").then(m => ({ default: m.ContestDemoPanel })), { ssr: false, loading: () => null });
import { contestDemoPrompt } from "@/components/demo/ContestDemoPanel";
const ExamResourceCard = dynamic(() => import("@/components/exam/ExamResourceCard").then(m => ({ default: m.ExamResourceCard })), { ssr: false, loading: () => null });
const ResourcePackageCard = dynamic(() => import("@/components/resources/ResourcePackageCard").then(m => ({ default: m.ResourcePackageCard })), { ssr: false, loading: () => null });
const ExplainerPlayer = dynamic(() => import("@/components/explainer/ExplainerPlayer").then(m => ({ default: m.ExplainerPlayer })), { ssr: false, loading: () => null });
const LearningLoopVisual = dynamic(() => import("@/components/visual/LearningLoopVisual").then(m => ({ default: m.LearningLoopVisual })), { ssr: false, loading: () => null });
const KnowledgeOrbital3D = dynamic(() => import("@/components/visual/KnowledgeOrbital3D").then(m => ({ default: m.KnowledgeOrbital3D })), { ssr: false, loading: () => null });
const Orbital3DStage = dynamic(() => import("@/components/visual/orbital3d/Orbital3DStage").then(m => ({ default: m.Orbital3DStage })), { ssr: false, loading: () => null });
const LiveTelemetryHUD = dynamic(() => import("@/components/visual/LiveTelemetryHUD").then(m => ({ default: m.LiveTelemetryHUD })), { ssr: false, loading: () => null });
const NextActionCard = dynamic(() => import("@/components/visual/NextActionCard").then(m => ({ default: m.NextActionCard })), { ssr: false, loading: () => null });
import { MessageBubble } from "./MessageBubble";
import { ChatInput, type CapabilityOption } from "./ChatInput";

// 主界面只露 4 个能力。chat/goal/learning 后端仍注册，由 agentic 自动路由。
const capabilities: CapabilityOption[] = [
  {
    id: "agentic",
    label: "智能路由 ✨",
    description: "AI 自主调用：诊断 / 检索 / 路径规划，问什么都先选它",
    icon: Sparkles,
  },
  {
    id: "resource_gen",
    label: "资源生成",
    description: "出题 / 讲义 / 试卷 / 闪卡 / 思维导图 / 代码 / 音频，一键打包",
    icon: Wand2,
  },
  {
    id: "auto_tutor",
    label: "Auto-Tutor 闭环",
    description: "诊断→生成→测验→评估→重规划，7 阶段全跑",
    icon: Rocket,
  },
  {
    id: "debate",
    label: "多智能体辩论",
    description: "X vs Y 类问题。正方/反方/裁判 2 轮辩出结论",
    icon: MessageSquare,
  },
  {
    id: "explainer",
    label: "动画讲解",
    description: "渐进 Mermaid + 讯飞 TTS 旁白 = 短视频式答疑",
    icon: Brain,
  },
];

const quickPromptsByCapability: Record<string, string[]> = {
  agentic: [
    "我刚学完线性回归，接下来该学什么？根据我的画像帮我规划",
    "帮我查一下我现在掌握得怎么样，最弱的是什么",
    "我想 2 周入门机器学习，从我现状出发安排一下",
    "今天该复习什么？给我一份当下最该看的内容",
  ],
  resource_gen: [
    "请生成 5 道 Python 基础选择题，主题是变量、条件判断和循环，做成可打印测试卷，并提供 Word 和 PDF 打印入口",
    "基于我薄弱的循环和条件判断，生成一份微讲义、练习题和复习卡片",
    "生成一份监督学习入门资源包，包含知识结构、测验题和错题反馈建议",
  ],
  auto_tutor: [
    "我想 2 周入门机器学习，请帮我跑一次完整的学习闭环",
    "我 Python 基础一般，想系统学习深度学习，帮我跑闭环并定位薄弱点",
    "围绕动态规划，给我一次完整的诊断 + 资源 + 测验 + 复盘",
  ],
  debate: [
    "刷题和看书谁更适合机器学习入门？让 AI 们辩论一下",
    "我应该先学线性代数还是先动手做项目？正反方辩",
    "对 0 基础学算法，自顶向下还是自底向上更好？",
  ],
  explainer: [
    "讲一下反向传播怎么工作",
    "用动画讲清楚 K-Means 的迭代过程",
    "演示 Transformer 注意力机制是怎么算的",
  ],
};

const stageLabelMap: Record<string, string> = {
  refining_goal: "目标细化",
  mapping_skills: "能力映射",
  identifying_gaps: "差距定位",
  building_profile: "画像更新",
  scheduling_path: "路径编排",
  generating: "资源生成",
  tutor_response: "导学讲解",
  goal_diagnosis: "目标诊断",
  learning_plan: "学习路径规划",
  resource_generation: "资源构建",
};

const capabilityWorkflows: Record<string, string[]> = {
  agentic: ["理解意图", "决定工具", "并行执行", "总结回答"],
  resource_gen: ["检索材料", "生成讲义", "生成练习", "沉淀复习"],
  auto_tutor: ["目标诊断", "并行生成", "试卷+自评", "更新画像", "重规划"],
  debate: ["正方一辩", "反方一驳", "正方二辩", "反方二驳", "裁判终审"],
};

interface SessionSummary {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
}

function ChatPanelInner() {
  const {
    state,
    sendMessage,
    cancelTurn,
    newSession,
    switchSession,
    clearError,
    submitQuizAnswer,
  } = useChat();
  const { role, shouldShow } = useRole();
  const [selectedCapability, setSelectedCapability] =
    useState<CapabilityOption>(capabilities[0]);
  const [rightOpen, setRightOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

  // Esc 关抽屉。响应更快。
  useEffect(() => {
    if (!rightOpen && !navOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setRightOpen(false);
        setNavOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rightOpen, navOpen]);
  const [profile, setProfile] = useState<LearningProfile | null>(null);
  const [knowledgeDocs, setKnowledgeDocs] = useState<
    KnowledgeDocumentSummary[] | null
  >(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [showSessions, setShowSessions] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: state.isStreaming ? "instant" : "smooth",
    });
  }, [state.messages, state.streamingContent, state.isStreaming]);

  // 流式生成时自动打开右侧面板（展示画像/流水线等动态内容）
  useEffect(() => {
    if (state.isStreaming) setRightOpen(true);
  }, [state.isStreaming]);

  useEffect(() => {
    let cancelled = false;
    listKnowledgeDocuments()
      .then((docs) => {
        if (!cancelled) setKnowledgeDocs(docs);
      })
      .catch(() => {
        if (!cancelled) setKnowledgeDocs([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!state.sessionId || state.isStreaming) return;
    let cancelled = false;
    getLearningProfile(state.sessionId)
      .then((nextProfile) => {
        if (!cancelled) setProfile(nextProfile);
      })
      .catch(() => {
        if (!cancelled) setProfile(null);
      });
    return () => {
      cancelled = true;
    };
  }, [state.sessionId, state.isStreaming, state.messages.length]);

  const loadSessions = useCallback(async () => {
    try {
      const res = await apiFetch("/api/v1/sessions");
      if (res.ok) setSessions(await res.json());
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    if (!state.isStreaming) loadSessions();
  }, [state.isStreaming, loadSessions]);

  const handleSend = (content: string, capability: string) => {
    sendMessage(content, capability);
  };

  const handleRunContestDemo = (prompt?: string, capability?: string) => {
    const effectivePrompt = prompt ?? contestDemoPrompt;
    const effectiveCapability = capability ?? "resource_gen";
    const cap = capabilities.find((c) => c.id === effectiveCapability);
    if (cap) setSelectedCapability(cap);
    handleSend(effectivePrompt, effectiveCapability);
  };

  const handleNewSession = () => {
    newSession();
    setProfile(null);
  };

  const quickPrompts =
    quickPromptsByCapability[selectedCapability.id] ||
    quickPromptsByCapability.agentic;

  const activeStageLabel =
    state.activeStages.length > 0
      ? stageLabelMap[state.activeStages[state.activeStages.length - 1]] ??
        "处理中"
      : state.isStreaming
        ? "生成中"
        : state.messages.length > 0
          ? "已完成"
          : "待输入";
  const workflowSteps =
    capabilityWorkflows[selectedCapability.id] || capabilityWorkflows.agentic;
  const assistantMessageCount = state.messages.filter(
    (message) => message.role === "assistant",
  ).length;
  return (
    <div className="relative flex h-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
      {navOpen ? (
        <div
          role="button"
          tabIndex={-1}
          aria-label="关闭菜单"
          onClick={() => setNavOpen(false)}
          className="absolute inset-0 z-30 bg-black/10 backdrop-blur-[2px] lf-fade-in lg:hidden"
        />
      ) : null}
      <aside
        className={`absolute left-0 top-0 z-40 flex h-full w-[260px] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--sidebar)] shadow-[12px_0_40px_rgba(0,0,0,0.06)] backdrop-blur-2xl transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] lg:relative lg:w-[248px] lg:translate-x-0 lg:shadow-none ${
          navOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}>
        <div className="flex h-14 items-center gap-3 px-5">
          <BrandMark variant="logo" size={34} className="rounded-xl" />
          <div>
            <div className="text-[14px] font-semibold">ZhiPath</div>
            <div className="text-[11px] text-[var(--muted-foreground)]">
              Personal tutor
            </div>
          </div>
        </div>

        <button
          type="button"
          className="mx-4 mt-2 flex items-center justify-center gap-2 rounded-2xl bg-[var(--primary)] px-3 py-2.5 text-[13px] font-medium text-white shadow-sm transition hover:bg-[var(--primary-dark)]"
          onClick={handleNewSession}
        >
          <PenLine size={15} />
          新建学习会话
        </button>

        <nav className="mt-5 space-y-1 px-3">
          {[
            {
              label: "导师对话",
              icon: MessageSquare,
              active: !showSessions,
              onClick: () => setShowSessions(false),
            },
            {
              label: "历史会话",
              icon: Compass,
              active: showSessions,
              onClick: () => setShowSessions(true),
            },
          ].map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={item.onClick}
              className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left text-[13px] transition ${
                item.active
                  ? "bg-[var(--card-solid)] text-[var(--foreground)] shadow-sm"
                  : "text-[var(--muted-foreground)] hover:bg-[var(--card-solid)] hover:text-[var(--foreground)]"
              }`}
            >
              <item.icon size={16} strokeWidth={item.active ? 2 : 1.7} />
              {item.label}
            </button>
          ))}
          {/* 按角色过滤显示导航 — 学生只看 4 个、教师只看 3 个、演示模式看全部 */}
          {[
            { slot: "nav.profile" as const, href: "/profile", icon: UserRound, label: "学习者画像" },
            { slot: "nav.path" as const, href: "/path", icon: Route, label: "学习路径" },
            { slot: "nav.resources" as const, href: "/resources", icon: Boxes, label: "资源工坊" },
            { slot: "nav.knowledge" as const, href: "/knowledge", icon: Library, label: "知识库" },
            { slot: "nav.dashboard" as const, href: "/dashboard", icon: LayoutDashboard, label: "学习仪表盘" },
            { slot: "nav.classroom" as const, href: "/classroom", icon: GraduationCap, label: "班级视图" },
            { slot: "nav.overview" as const, href: "/overview", icon: LayoutDashboard, label: "系统总览" },
          ]
            .filter((n) => shouldShow(n.slot))
            .map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left text-[13px] text-[var(--muted-foreground)] transition hover:bg-[var(--card-solid)] hover:text-[var(--foreground)]"
              >
                <n.icon size={16} strokeWidth={1.7} />
                {n.label}
              </Link>
            ))}
        </nav>

        {shouldShow("demo.panel") ? (
          <div className="px-4">
            <ContestDemoPanel
              compact
              disabled={state.isStreaming}
              onRun={handleRunContestDemo}
            />
          </div>
        ) : null}

        {showSessions ? (
          <div className="mt-4 flex-1 overflow-y-auto px-3">
            <div className="mb-2 px-1 text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
              会话列表
            </div>
            {sessions.length === 0 ? (
              <div className="px-1 py-4 text-[12px] text-[var(--muted-foreground)]">
                暂无历史会话
              </div>
            ) : (
              <div className="space-y-1">
                {sessions.map((session) => (
                  <button
                    key={session.id}
                    type="button"
                    onClick={() => {
                      switchSession(session.id);
                      setShowSessions(false);
                    }}
                    className={`w-full rounded-2xl px-3 py-2 text-left text-[12px] transition hover:bg-[var(--card-solid)] ${
                      state.sessionId === session.id
                        ? "bg-[var(--card-solid)] shadow-sm"
                        : ""
                    }`}
                  >
                    <div className="truncate font-medium">{session.title}</div>
                    <div className="mt-0.5 text-[11px] text-[var(--muted-foreground)]">
                      {session.message_count} 条消息
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="mt-6 px-4">
              <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
                当前能力
              </div>
              <div className="space-y-1.5">
                {capabilities.map((capability) => (
                  <button
                    key={capability.id}
                    type="button"
                    onClick={() => setSelectedCapability(capability)}
                    className={`w-full rounded-2xl border px-3 py-2 text-left transition ${
                      selectedCapability.id === capability.id
                        ? "border-[var(--border)] bg-[var(--card-solid)] shadow-sm"
                        : "border-transparent bg-transparent hover:border-[var(--border)] hover:bg-[var(--card-solid)]"
                    }`}
                  >
                    <div className="flex items-center gap-2 text-[13px] font-medium">
                      <capability.icon
                        size={15}
                        className={
                          selectedCapability.id === capability.id
                            ? "text-[var(--primary)]"
                            : ""
                        }
                      />
                      {capability.label}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-auto border-t border-[var(--border)] px-4 py-4">
              <div className="flex items-center gap-2 text-[12px] text-[var(--muted-foreground)]">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                {knowledgeDocs
                  ? `知识库 ${knowledgeDocs.length} 份文档`
                  : "知识库加载中"}
              </div>
            </div>
          </>
        )}
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-4 backdrop-blur-2xl md:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setNavOpen(true)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--foreground)] transition hover:bg-[var(--muted)] active:scale-95 lg:hidden"
              title="菜单"
            >
              <Menu size={18} />
            </button>
            <h1 className="truncate text-[15px] font-semibold tracking-tight">
              ZhiPath
            </h1>
            {state.isStreaming ? (
              <button
                type="button"
                onClick={cancelTurn}
                className="ml-2 inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-medium text-red-600 transition hover:bg-red-100 active:scale-95"
              >
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
                停止
              </button>
            ) : null}
          </div>
          <div className="flex items-center gap-1.5">
            <RoleSwitcher compact />
            <SettingsButton />
            <ThemeToggle compact />
            <button
              type="button"
              onClick={() => setRightOpen((v) => !v)}
              className={`inline-flex h-9 w-9 items-center justify-center rounded-full transition active:scale-95 ${
                rightOpen
                  ? "bg-[var(--primary)] text-white"
                  : "text-[var(--foreground)] hover:bg-[var(--muted)]"
              }`}
              title={rightOpen ? "收起详情" : "打开详情"}
            >
              <PanelRight size={16} />
            </button>
          </div>
        </header>

        <div className="relative flex min-h-0 flex-1">
          <section className="flex min-h-0 flex-1 flex-col">
            <div className="lf-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6">
              {state.messages.length === 0 && !state.isStreaming && (
                <div className="mx-auto flex max-w-4xl flex-col py-2">
                  <div className="mb-3">
                    <h2 className="max-w-2xl text-[20px] font-semibold leading-tight text-[var(--foreground)] md:text-[22px]">
                      今天想学什么？
                    </h2>
                    <p className="mt-1 max-w-xl text-[13px] leading-5 text-[var(--muted-foreground)]">
                      输入目标、问题或教材主题，系统会保留上下文并生成下一步学习动作。
                    </p>
                  </div>

                  <NextActionCard
                    sessionId={state.sessionId}
                    onPick={(p, c) => handleRunContestDemo(p, c)}
                  />

                  <div className="grid gap-2 sm:grid-cols-2">
                    {quickPrompts.slice(0, 4).map((prompt, idx) => {
                      const QuickIcon = [MessageSquare, BarChart3, CalendarDays, BookOpen][idx];
                      return (
                        <motion.button
                          key={prompt}
                          type="button"
                          onClick={() =>
                            handleSend(prompt, selectedCapability.id)
                          }
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.15 + idx * 0.06, duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                          whileHover={{ scale: 1.01, borderColor: "rgba(0,122,255,0.3)" }}
                          whileTap={{ scale: 0.98 }}
                          className="group flex items-start gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-left transition-colors hover:bg-[var(--muted)]"
                        >
                          <QuickIcon size={14} className="mt-0.5 shrink-0 text-[var(--muted-foreground)]" />
                          <span className="text-[12px] leading-5 text-[var(--foreground)]">{prompt}</span>
                        </motion.button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="mx-auto max-w-4xl">
                {state.messages.map((msg, i) => {
                  const isLastAssistant = msg.role === "assistant" && i === state.messages.length - 1;
                  return (
                    <div key={`${msg.timestamp}-${i}`}>
                      <MessageBubble
                        role={msg.role}
                        content={msg.content}
                        thinking={msg.thinking}
                        sessionId={state.sessionId}
                        capability={state.activeCapability}
                        quizData={isLastAssistant && !state.examData ? state.quizData : undefined}
                        quizResult={isLastAssistant ? state.quizResult : undefined}
                        onQuizSubmit={isLastAssistant ? submitQuizAnswer : undefined}
                      />
                      {isLastAssistant && state.resourcePackage && (
                        <ResourcePackageCard pkg={state.resourcePackage} compact />
                      )}
                      {isLastAssistant && state.examData && !state.resourcePackage && (
                        <ExamResourceCard exam={state.examData} />
                      )}
                      {isLastAssistant && (msg.result || state.streamingResult) ? (
                        <ExplainerPlayer scriptJson={msg.result || state.streamingResult} />
                      ) : null}
                    </div>
                  );
                })}

                {state.isStreaming && (
                  <>
                    {state.activeStages.length > 0 && (
                      <div className="mb-3 ml-12 flex flex-wrap gap-2">
                        {state.activeStages.map((stage) => (
                          <span
                            key={stage}
                            className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(0,122,255,0.18)] bg-[rgba(0,122,255,0.08)] px-2.5 py-1 text-[11px] font-medium text-[var(--primary)]"
                          >
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--primary)]" />
                            {stageLabelMap[stage] ?? "处理中"}
                          </span>
                        ))}
                      </div>
                    )}
                    <MessageBubble
                      role="assistant"
                      content={state.streamingContent}
                      isStreaming
                      thinking={state.streamingThinking}
                    />
                  </>
                )}

                {state.error && (
                  <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
                    {state.error}
                    <button
                      type="button"
                      onClick={clearError}
                      className="ml-3 font-medium underline"
                    >
                      关闭
                    </button>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            </div>

            <ChatInput
              onSend={handleSend}
              onCancel={cancelTurn}
              disabled={state.isStreaming}
              capabilities={capabilities}
              selectedCapability={selectedCapability}
              onSelectCapability={setSelectedCapability}
            />
          </section>

          {/* 右侧详情：默认完全收起，点 header 的 PanelRight 钮才滑入 */}
          {rightOpen ? (
            <div
              role="button"
              tabIndex={-1}
              aria-label="关闭详情"
              onClick={() => setRightOpen(false)}
              className="absolute inset-0 z-30 bg-black/10 backdrop-blur-[2px] lf-fade-in xl:hidden"
            />
          ) : null}
          <aside
            className={`absolute right-0 top-0 z-40 flex h-full w-[380px] max-w-[92vw] flex-col border-l border-[var(--border)] bg-[var(--surface)] shadow-[-12px_0_40px_rgba(0,0,0,0.06)] backdrop-blur-2xl transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] xl:max-w-none xl:w-[400px] xl:shadow-none ${
              rightOpen
                ? "translate-x-0 xl:relative"
                : "translate-x-full xl:absolute xl:translate-x-full"
            }`}
            style={{ pointerEvents: rightOpen ? "auto" : "none" }}
          >
            <div className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--border)] px-5">
              <span className="text-[13px] font-semibold tracking-tight">详情</span>
              <button
                type="button"
                onClick={() => setRightOpen(false)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[var(--muted-foreground)] hover:bg-[var(--muted)] active:scale-95"
                title="收起"
              >
                <PanelRight size={14} />
              </button>
            </div>
            <div className="lf-scrollbar flex-1 overflow-y-auto px-4 py-4">
              <RightTabPanel
                role={role}
                state={state}
                profile={profile}
                knowledgeDocs={knowledgeDocs}
                shouldShow={shouldShow}
                hideAutoTutor={selectedCapability.id !== "auto_tutor" && state.loopSteps.length === 0}
              />

              {state.guardrail && shouldShow("chat.guardrail") ? (
                <section className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  <p className="font-semibold">🛡 内容安全</p>
                  <p className="mt-0.5 leading-5">{state.guardrail.reason}</p>
                </section>
              ) : null}
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

export function ChatPanel() {
  return (
    <ChatProvider>
      <ChatPanelInner />
    </ChatProvider>
  );
}
