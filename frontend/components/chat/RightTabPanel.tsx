"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Brain,
  FileText,
  Network,
  Quote,
  Rocket,
  Timer,
  Zap,
} from "lucide-react";
import { apiUrl, type KnowledgeDocumentSummary, type LearningProfile } from "@/lib/api";
import { AgentMessageFeed } from "@/components/agent/AgentMessageFeed";
import { AgentWorkflowGraph } from "@/components/agent/AgentWorkflowGraph";
import { GenerationPipeline } from "@/components/agent/GenerationPipeline";
import { AutoTutorLoopVisual } from "@/components/visual/AutoTutorLoopVisual";
import { PomodoroTimer } from "@/components/pomodoro/PomodoroTimer";
import { ProfileEvidencePanel } from "@/components/profile/ProfileEvidencePanel";
import type { VisibleSlot } from "@/context/RoleContext";
import type { ChatState } from "@/context/ChatContext";

/**
 * 右侧 tab 化面板：默认只展开 1 个 tab，其他折叠成 chip。
 * - 角色不同 → 默认 tab 不同（学生 = 学情 / 教师 = PDF 周报 / 演示 = 多智能体）
 * - 不可见的 tab 自动隐藏（按 shouldShow 槽位过滤）
 */
interface RightTabPanelProps {
  role: "student" | "teacher" | "showcase";
  state: ChatState;
  profile: LearningProfile | null;
  knowledgeDocs: KnowledgeDocumentSummary[] | null;
  shouldShow: (slot: VisibleSlot) => boolean;
  hideAutoTutor?: boolean;
}

type TabKey =
  | "agents"
  | "pipeline"
  | "profile"
  | "auto_tutor"
  | "sources"
  | "pomodoro"
  | "pdf";

interface TabDef {
  key: TabKey;
  label: string;
  icon: typeof Brain;
  slot: VisibleSlot;
  /** 该 tab 在当前 state 下是否"有内容"。无内容时显示为灰色但仍可点击。 */
  hasContent: (state: ChatState) => boolean;
}

const ALL_TABS: TabDef[] = [
  {
    key: "agents",
    label: "多智能体",
    icon: Network,
    slot: "panel.agent_graph",
    hasContent: (s) => s.isStreaming || Object.keys(s.agentNodes).length > 0,
  },
  {
    key: "pipeline",
    label: "协作流水线",
    icon: Zap,
    slot: "panel.agent_graph",
    hasContent: (s) => s.isStreaming || Object.keys(s.agentNodes).length > 0,
  },
  {
    key: "profile",
    label: "画像证据链",
    icon: Brain,
    slot: "panel.profile_evidence",
    hasContent: (s) => Boolean(s.sessionId),
  },
  {
    key: "auto_tutor",
    label: "Auto-Tutor 闭环",
    icon: Rocket,
    slot: "panel.auto_tutor_loop",
    hasContent: (s) => s.loopSteps.length > 0,
  },
  {
    key: "sources",
    label: "知识引用",
    icon: Quote,
    slot: "panel.knowledge_sources",
    hasContent: (s) => s.knowledgeSources.length > 0,
  },
  {
    key: "pomodoro",
    label: "番茄钟",
    icon: Timer,
    slot: "panel.pomodoro",
    hasContent: (s) => Boolean(s.sessionId),
  },
  {
    key: "pdf",
    label: "学习周报",
    icon: FileText,
    slot: "panel.pdf_report",
    hasContent: (s) => Boolean(s.sessionId),
  },
];

const DEFAULT_TAB_BY_ROLE: Record<"student" | "teacher" | "showcase", TabKey> = {
  student: "profile",
  teacher: "pdf",
  showcase: "pipeline",
};

export function RightTabPanel({
  role,
  state,
  profile,
  knowledgeDocs,
  shouldShow,
  hideAutoTutor,
}: RightTabPanelProps) {
  const visibleTabs = useMemo(
    () =>
      ALL_TABS.filter((t) => shouldShow(t.slot)).filter(
        (t) => !(hideAutoTutor && t.key === "auto_tutor"),
      ),
    [shouldShow, hideAutoTutor],
  );

  const [active, setActive] = useState<TabKey>(() => {
    // 如果默认 tab 不在可见列表里，退而选第一个
    const def = DEFAULT_TAB_BY_ROLE[role];
    return visibleTabs.some((t) => t.key === def) ? def : visibleTabs[0]?.key ?? "agents";
  });

  // 当 role 切换时重置默认 tab（visibleTabs 引用变化不重置，避免覆盖用户手动选择）
  useEffect(() => {
    const def = DEFAULT_TAB_BY_ROLE[role];
    if (visibleTabs.some((t) => t.key === def)) setActive(def);
    else if (visibleTabs[0]) setActive(visibleTabs[0].key);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  // 如果 active tab 不在可见列表里，fallback 到第一个可见 tab
  useEffect(() => {
    if (active && !visibleTabs.some((t) => t.key === active)) {
      setActive(visibleTabs[0]?.key ?? "agents");
    }
  }, [active, visibleTabs]);

  // 流式生成时自动切到流水线 tab（所有角色）
  useEffect(() => {
    if (
      state.isStreaming &&
      visibleTabs.some((t) => t.key === "pipeline")
    ) {
      setActive("pipeline");
    }
  }, [state.isStreaming, visibleTabs]);

  if (visibleTabs.length === 0) {
    return (
      <p className="text-center text-xs text-[var(--muted-foreground)]">
        当前角色已隐藏所有右侧面板。
      </p>
    );
  }

  return (
    <section className="mb-5 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3 shadow-sm">
      {/* tab chips */}
      <nav className="hide-scrollbar mb-3 flex gap-1 overflow-x-auto">
        {visibleTabs.map((t) => {
          const isActive = active === t.key;
          const has = t.hasContent(state);
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setActive(t.key)}
              className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                isActive
                  ? "bg-[var(--primary)] text-white shadow"
                  : has
                    ? "bg-[var(--card-solid)] text-[var(--foreground)] hover:bg-[var(--muted)]"
                    : "bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--card-solid)]"
              }`}
              title={has ? "" : "尚无数据"}
            >
              <t.icon size={11} />
              {t.label}
              {has && !isActive ? (
                <span className="h-1 w-1 rounded-full bg-emerald-500" />
              ) : null}
            </button>
          );
        })}
      </nav>

      {/* active panel */}
      <div className="min-h-[120px]">
        {active === "agents" ? (
          <AgentsTab state={state} profile={profile} knowledgeDocs={knowledgeDocs} />
        ) : active === "pipeline" ? (
          <PipelineTab state={state} />
        ) : active === "profile" ? (
          state.sessionId ? (
            <ProfileEvidencePanel sessionId={state.sessionId} compact />
          ) : (
            <EmptyTab text="发送第一条消息后会自动构建画像。" />
          )
        ) : active === "auto_tutor" ? (
          <AutoTutorLoopVisual />
        ) : active === "sources" ? (
          state.knowledgeSources.length > 0 ? (
            <SourcesTab state={state} />
          ) : (
            <EmptyTab text="本轮对话尚未触发知识库检索。" />
          )
        ) : active === "pomodoro" ? (
          state.sessionId ? (
            <PomodoroTimer sessionId={state.sessionId} />
          ) : (
            <EmptyTab text="先发送一条消息开启会话再开始番茄钟。" />
          )
        ) : active === "pdf" ? (
          state.sessionId ? (
            <PdfReportLink sessionId={state.sessionId} />
          ) : (
            <EmptyTab text="发送一条消息开启会话后，可下载本会话周报 PDF。" />
          )
        ) : null}
      </div>
    </section>
  );
}

// ---- 各 tab 内容子组件 ----

function PipelineTab({ state }: { state: ChatState }) {
  return (
    <div className="space-y-3">
      <GenerationPipeline
        agentNodes={state.agentNodes}
        isStreaming={state.isStreaming}
        activeCapability={state.activeCapability}
        compact
      />
      {state.agentEdges.length > 0 ? <AgentMessageFeed compact /> : null}
    </div>
  );
}

function AgentsTab({
  state,
  profile,
  knowledgeDocs,
}: {
  state: ChatState;
  profile: LearningProfile | null;
  knowledgeDocs: KnowledgeDocumentSummary[] | null;
}) {
  return (
    <div className="space-y-3">
      <AgentWorkflowGraph
        activeStages={state.activeStages}
        agentNodes={state.agentNodes}
        compact
        hasFeedback={Boolean(state.quizResult)}
        hasKnowledge={(knowledgeDocs?.length ?? 0) > 0}
        hasProfile={Boolean(
          profile?.learning_goal || profile?.topics.length || profile?.weak_points.length,
        )}
        hasResource={Boolean(state.resourcePackage || state.examData || state.quizData)}
        isStreaming={state.isStreaming}
      />
      {state.agentEdges.length > 0 ? <AgentMessageFeed compact /> : null}
    </div>
  );
}

function SourcesTab({ state }: { state: ChatState }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--muted)] p-3">
      <header className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">📎 本轮知识引用</h3>
        {state.lowConfidenceSources ? (
          <span className="rounded-full bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:text-amber-300">
            ⚠ 低置信度
          </span>
        ) : null}
      </header>
      <ul className="space-y-1.5">
        {state.knowledgeSources.map((src) => (
          <li
            key={src.index}
            className="rounded-xl bg-[var(--card-solid)] px-2.5 py-1.5 text-xs text-[var(--foreground)] shadow-sm"
          >
            <span className="font-semibold">
              [#{src.index}] {src.title}
            </span>
            {typeof src.score === "number" ? (
              <span className="ml-1 text-[var(--muted-foreground)]">· {src.score.toFixed(2)}</span>
            ) : null}
            {src.excerpt ? (
              <span className="ml-1 text-[var(--muted-foreground)]">— {src.excerpt}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function PdfReportLink({ sessionId }: { sessionId: string }) {
  return (
    <div className="space-y-2">
      <a
        href={apiUrl(`/api/v1/report/${sessionId}/weekly.pdf`)}
        target="_blank"
        rel="noreferrer noopener"
        className="block rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 px-4 py-3 text-center text-sm font-semibold text-emerald-700 dark:text-emerald-400 transition hover:bg-emerald-100 dark:hover:bg-emerald-900/30"
      >
        📄 下载本会话学习周报 (PDF)
      </a>
      <p className="text-[11px] leading-4 text-[var(--muted-foreground)]">
        包含 7 维度画像 + BKT 掌握度柱状图 + FSRS 复习日历 + Trace 摘要。可发给家长 / 老师。
      </p>
    </div>
  );
}

function EmptyTab({ text }: { text: string }): ReactNode {
  return (
    <div className="flex h-32 items-center justify-center rounded-xl bg-[var(--muted)] px-4 text-center text-[12px] text-[var(--muted-foreground)]">
      {text}
    </div>
  );
}
