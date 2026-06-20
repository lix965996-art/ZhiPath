"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import dynamic from "next/dynamic";
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  Menu,
  MessageSquare,
  PanelRight,
} from "lucide-react";
import { ChatProvider, useChat } from "@/context/ChatContext";
import {
  apiFetch,
  getLearningProfile,
  listKnowledgeDocuments,
  type KnowledgeDocumentSummary,
  type LearningProfile,
} from "@/lib/api";
// 重量级组件 → 懒加载，不阻塞首屏和路由切换
const RightTabPanel = dynamic(() => import("@/components/chat/RightTabPanel").then(m => ({ default: m.RightTabPanel })), { ssr: false, loading: () => null });
import { SettingsButton } from "@/components/settings/SettingsButton";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { useRole } from "@/context/RoleContext";
const ExamResourceCard = dynamic(() => import("@/components/exam/ExamResourceCard").then(m => ({ default: m.ExamResourceCard })), { ssr: false, loading: () => null });
const ResourcePackageCard = dynamic(() => import("@/components/resources/ResourcePackageCard").then(m => ({ default: m.ResourcePackageCard })), { ssr: false, loading: () => null });
const ExplainerPlayer = dynamic(() => import("@/components/explainer/ExplainerPlayer").then(m => ({ default: m.ExplainerPlayer })), { ssr: false, loading: () => null });
const BrandTree = dynamic(() => import("@/components/visual/BrandTree").then(m => ({ default: m.BrandTree })), { ssr: false, loading: () => null });
import { MessageBubble } from "./MessageBubble";
import { ChatVideoCard } from "./ChatVideoCard";
import { ChatInput, type CapabilityOption } from "./ChatInput";
import { AppSidebar } from "@/components/layout/AppSidebar";

// 聊天页只负责导师对话。学习任务、资源和实验通过独立页面进入。
const capabilities: CapabilityOption[] = [
  {
    id: "agentic",
    label: "导师对话",
    description: "围绕当前学习内容提问、追问和纠错",
    icon: MessageSquare,
  },
];

const quickPromptsByCapability: Record<string, string[]> = {
  agentic: [
    "我不理解银行家算法为什么要先计算 Need 矩阵",
    "进程和线程在 408 选择题里最容易混淆的地方是什么？",
    "死锁预防、死锁避免、死锁检测有什么区别？",
    "我做完一道题后，怎么判断自己是概念不会还是计算失误？",
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

  const handleNewSession = () => {
    newSession();
    setProfile(null);
  };

  const quickPrompts =
    quickPromptsByCapability[selectedCapability.id] ||
    quickPromptsByCapability.agentic;

  return (
    <div className="relative flex h-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
      <AppSidebar
        open={navOpen}
        onClose={() => setNavOpen(false)}
        onNewSession={() => {
          handleNewSession();
          setShowSessions(false);
        }}
        onShowHistory={() => {
          setShowSessions(true);
          setRightOpen(false);
        }}
        historyActive={showSessions}
        knowledgeCount={knowledgeDocs?.length ?? null}
      />

      <main className="flex min-w-0 flex-1 flex-col lg:ml-[248px]">
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
          {showSessions ? (
            <section className="absolute inset-0 z-20 overflow-y-auto bg-[var(--background)] px-4 py-5 md:px-6">
              <div className="mx-auto max-w-4xl">
                <div className="mb-4 flex items-center justify-between border-b border-[var(--border)] pb-4">
                  <div>
                    <h2 className="text-[16px] font-semibold">历史会话</h2>
                    <p className="mt-1 text-[12px] text-[var(--muted-foreground)]">
                      继续之前的问题，或返回新会话。
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowSessions(false)}
                    className="rounded-xl border border-[var(--border)] bg-[var(--card-solid)] px-3 py-2 text-[12px] font-medium hover:bg-[var(--muted)]"
                  >
                    返回对话
                  </button>
                </div>
                {sessions.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)] px-5 py-10 text-center text-[13px] text-[var(--muted-foreground)]">
                    还没有历史会话
                  </div>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {sessions.map((session) => (
                      <button
                        key={session.id}
                        type="button"
                        onClick={() => {
                          switchSession(session.id);
                          setShowSessions(false);
                        }}
                        className="rounded-2xl border border-[var(--border)] bg-[var(--card-solid)] p-4 text-left transition hover:border-[var(--primary)]"
                      >
                        <div className="truncate text-[13px] font-semibold">
                          {session.title}
                        </div>
                        <div className="mt-2 text-[11px] text-[var(--muted-foreground)]">
                          {session.message_count} 条消息
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </section>
          ) : null}
          <section className="flex min-h-0 flex-1 flex-col">
            <div className="lf-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6">
              {state.messages.length === 0 && !state.isStreaming && (
                <div className="mx-auto flex max-w-4xl flex-col py-2">
                  <div
                    className="relative mb-4 overflow-hidden rounded-2xl border border-[var(--border)]"
                    style={{
                      background:
                        "radial-gradient(130% 120% at 72% 0%, rgba(124,58,237,0.12), transparent 55%), radial-gradient(120% 120% at 18% 100%, rgba(59,130,246,0.10), transparent 50%), var(--card)",
                    }}
                  >
                    <BrandTree className="h-[200px] w-full" />
                    <div className="pointer-events-none absolute left-5 top-5">
                      <div className="text-[17px] font-semibold tracking-tight text-[var(--foreground)]">
                        408 学习工作台
                      </div>
                      <div className="mt-0.5 max-w-[260px] text-[12px] leading-5 text-[var(--muted-foreground)]">
                        学习任务、课程资源和答疑记录都从这里进入
                      </div>
                    </div>
                  </div>

                  <div className="mb-3">
                    <h2 className="max-w-2xl text-[20px] font-semibold leading-tight text-[var(--foreground)] md:text-[22px]">
                      现在要解决什么？
                    </h2>
                    <p className="mt-1 max-w-xl text-[13px] leading-5 text-[var(--muted-foreground)]">
                      直接输入不理解的知识点、题目或步骤。完整学习任务请从左侧进入。
                    </p>
                  </div>

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
                      {msg.video && <ChatVideoCard video={msg.video} />}
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
                    {state.streamingVideo && <ChatVideoCard video={state.streamingVideo} />}
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
