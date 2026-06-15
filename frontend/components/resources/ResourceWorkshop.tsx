"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  Code2,
  Database,
  FileText,
  HelpCircle,
  Loader2,
  Network,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  type LucideIcon,
} from "lucide-react";
import {
  listResourcePackages,
  type LearningResourcePackage,
} from "@/lib/api";
import { Suspense } from "react";

// ── Sub-views ──────────────────────────────────────────────────────
import { LectureView } from "./LectureView";
import { FlashcardView } from "./FlashcardView";
import { QuizView } from "./QuizView";
import { CodeView } from "./CodeView";
import { ResourceMindMap } from "./ResourceMindMap";

// ── Types ──────────────────────────────────────────────────────────

type TabKey = "lecture" | "mindmap" | "flashcard" | "quiz" | "code";

interface TabDef {
  key: TabKey;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
  matchTypes: string[];
}

const TABS: TabDef[] = [
  { key: "lecture", label: "微讲义", shortLabel: "讲义", icon: FileText, matchTypes: ["audio", "micro_lecture"] },
  { key: "mindmap", label: "知识结构", shortLabel: "导图", icon: Network, matchTypes: ["mindmap"] },
  { key: "flashcard", label: "记忆卡", shortLabel: "闪卡", icon: BookOpen, matchTypes: ["flashcards"] },
  { key: "quiz", label: "练习题", shortLabel: "习题", icon: HelpCircle, matchTypes: ["quiz", "exam"] },
  { key: "code", label: "代码实操", shortLabel: "代码", icon: Code2, matchTypes: ["code_lab"] },
];

const TAB_META: Record<TabKey, { title: string; detail: string; action: string }> = {
  lecture: {
    title: "先把概念读顺",
    detail: "按考点顺序看微讲义，不懂的段落直接让 AI 老师换一种讲法。",
    action: "解释这份讲义",
  },
  mindmap: {
    title: "先看主干，再补薄弱点",
    detail: "结构页只负责帮你定位考点。看懂一个节点后，马上回到讲义、练习题或代码实操验证。",
    action: "解释当前考点",
  },
  flashcard: {
    title: "用主动回忆记概念",
    detail: "先想答案，再翻卡。记不住的卡片适合转成下一轮复习任务。",
    action: "帮我复述这些卡片",
  },
  quiz: {
    title: "做题后马上定位错因",
    detail: "提交后看解析，不要只看对错。错题要回到对应考点补一轮。",
    action: "分析我的错题",
  },
  code: {
    title: "C 语言手写代码区",
    detail: "这里练函数、分支、循环、数组和结构体，不是打印知识点清单。",
    action: "拆解这道 C 题",
  },
};

// ── Main ───────────────────────────────────────────────────────────

function ResourceWorkshopInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlPkgId = searchParams.get("pkg") || "";
  const urlTab = searchParams.get("tab") as TabKey | null;

  const [packages, setPackages] = useState<LearningResourcePackage[]>([]);
  const [selectedPkgId, setSelectedPkgId] = useState(urlPkgId);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey | null>(null);

  useEffect(() => {
    let cancelled = false;
    listResourcePackages()
      .then((data) => {
        if (cancelled) return;
        setPackages(data);
        const target = urlPkgId && data.find((p) => p.id === urlPkgId);
        setSelectedPkgId(target ? target.id : data[0]?.id || "");
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selected = useMemo(
    () => packages.find((p) => p.id === selectedPkgId) || packages[0],
    [packages, selectedPkgId],
  );

  const availableTabs = useMemo(() => {
    if (!selected) return new Set<TabKey>();
    const assetTypes = new Set<string>();
    for (const a of selected.assets || []) assetTypes.add(a.type);
    return new Set(
      TABS.filter((t) => t.matchTypes.some((m) => assetTypes.has(m))).map((t) => t.key),
    );
  }, [selected]);

  useEffect(() => {
    if (urlTab && TABS.some((t) => t.key === urlTab)) { setActiveTab(urlTab); return; }
    const first = TABS.find((t) => availableTabs.has(t.key));
    setActiveTab(first?.key ?? "lecture");
  }, [selected, availableTabs]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 size={24} className="animate-spin text-[#5d6e57]" />
      </div>
    );
  }

  if (!selected) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3">
        <Sparkles size={28} className="text-[var(--primary)]" />
        <p className="text-[14px] font-medium">还没有资源包</p>
        <p className="text-[12px] text-[var(--muted-foreground)]">回到学习路径页生成</p>
      </div>
    );
  }

  const activeTabDef = activeTab ? TABS.find((tab) => tab.key === activeTab) : null;

  return (
    <main className="min-h-screen bg-[var(--background)]">
      {/* ── Top Bar ── */}
      <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur-xl">
        <div className="mx-auto flex min-h-[72px] max-w-7xl items-center justify-between gap-4 px-5">
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={() => router.push("/path")}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--card-solid)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              title="返回学习路径"
            >
              <ArrowLeft size={14} />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-[rgba(59,130,246,0.08)] px-2.5 py-1 text-[11px] font-semibold text-[var(--primary)]">
                  408 资源包
                </span>
                {activeTabDef ? (
                  <span className="text-[12px] text-[var(--muted-foreground)]">{activeTabDef.label}</span>
                ) : null}
              </div>
              <h1 className="mt-1 truncate text-[18px] font-bold tracking-tight">{selected.title}</h1>
            </div>
          </div>
          {packages.length > 1 ? (
            <select
              value={selectedPkgId}
              onChange={(e) => {
                setSelectedPkgId(e.target.value);
                const pkg = packages.find((p) => p.id === e.target.value);
                if (pkg) {
                  const types = new Set<string>();
                  for (const a of pkg.assets || []) types.add(a.type);
                  const first = TABS.find((t) => t.matchTypes.some((m) => types.has(m)));
                  setActiveTab(first?.key ?? "lecture");
                }
              }}
              className="max-w-[260px] cursor-pointer truncate rounded-xl border border-[var(--border)] bg-[var(--card-solid)] px-3 py-2 text-[12px] outline-none"
            >
              {packages.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          ) : null}
        </div>
      </header>

      {/* ── Tab Bar ── */}
      <div className="sticky top-[72px] z-20 border-b border-[var(--border)] bg-[var(--surface)]/92 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center gap-2 overflow-x-auto px-5 py-3">
          {TABS.map((t) => {
            const isActive = activeTab === t.key;
            const hasData = availableTabs.has(t.key);
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-[13px] font-semibold transition-all ${
                  isActive
                    ? "border-[var(--foreground)] bg-[var(--foreground)] text-white shadow-sm"
                    : hasData
                      ? "border-[var(--border)] bg-[var(--card-solid)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                      : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)]/65 hover:text-[var(--foreground)]"
                }`}
              >
                <Icon size={15} />
                {t.label}
                {!hasData ? <span className="text-[10px] font-medium opacity-70">未生成</span> : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="mx-auto max-w-7xl px-5 py-6">
        <ResourceBasisBar pkg={selected} compact={activeTab === "mindmap"} />
        <TabContent pkg={selected} tab={activeTab} onNavigate={(prompt) => {
          router.push("/chat?p=" + encodeURIComponent(prompt));
        }} />
      </div>
    </main>
  );
}

export function ResourceWorkshop() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center"><Loader2 size={24} className="animate-spin" /></div>}>
      <ResourceWorkshopInner />
    </Suspense>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Basis Bar
// ═══════════════════════════════════════════════════════════════════════

function ResourceBasisBar({ pkg, compact = false }: { pkg: LearningResourcePackage; compact?: boolean }) {
  const learner = pkg.learner_snapshot;
  const weakPoints = pkg.weak_points_targeted?.length
    ? pkg.weak_points_targeted
    : learner?.weak_points || [];
  const sources = pkg.knowledge_evidence?.sources || [];
  const basis = pkg.adaptation_basis || [];
  const stage = pkg.generated_for_stage?.label || "资源包生成";

  if (compact) {
    return (
      <section className="mb-5 rounded-2xl border border-[var(--border)] bg-[var(--card-solid)] px-4 py-3 shadow-[var(--shadow-soft)]">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] text-[var(--muted-foreground)]">
          <span className="font-semibold text-[var(--foreground)]">{pkg.topic || pkg.title}</span>
          <span>阶段：{stage}</span>
          {weakPoints[0] ? <span>薄弱点：{weakPoints.slice(0, 2).join(" / ")}</span> : null}
          {sources.length ? <span>依据：{sources.slice(0, 2).map((source) => source.title).join(" / ")}</span> : null}
        </div>
      </section>
    );
  }

  return (
    <section className="mb-5 grid gap-3 lg:grid-cols-3">
      <BasisCard
        icon={Target}
        title="生成目标"
        main={pkg.topic || pkg.title}
        detail={stage}
        tags={weakPoints.slice(0, 3)}
      />
      <BasisCard
        icon={ShieldCheck}
        title="画像依据"
        main={learner?.learning_goal || "根据当前学习目标生成"}
        detail={learner?.level ? `当前水平：${learner.level}` : "根据对话画像动态适配"}
        tags={basis.slice(0, 3)}
      />
      <BasisCard
        icon={Database}
        title="知识库依据"
        main={pkg.knowledge_evidence?.has_context ? `命中 ${sources.length || 1} 份来源` : "未绑定明确来源"}
        detail={pkg.knowledge_evidence?.has_context ? "生成内容应以这些证据为准" : "建议先从课程知识库检索依据"}
        tags={sources.slice(0, 2).map((source) => source.title)}
      />
    </section>
  );
}

function BasisCard({
  icon: Icon,
  title,
  main,
  detail,
  tags,
}: {
  icon: LucideIcon;
  title: string;
  main: string;
  detail: string;
  tags: string[];
}) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card-solid)] p-4 shadow-[var(--shadow-soft)]">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[rgba(59,130,246,0.08)] text-[var(--primary)]">
          <Icon size={16} />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-[var(--muted-foreground)]">{title}</p>
          <p className="mt-1 line-clamp-1 text-[13px] font-bold text-[var(--foreground)]">{main}</p>
          <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-[var(--muted-foreground)]">{detail}</p>
        </div>
      </div>
      {tags.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {tags.map((tag, index) => (
            <span
              key={`${tag}-${index}`}
              className="max-w-full truncate rounded-full bg-[var(--muted)] px-2 py-0.5 text-[10px] font-medium text-[var(--muted-foreground)]"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Tab Content Router
// ═══════════════════════════════════════════════════════════════════════

function MindmapView({ pkg }: { pkg: LearningResourcePackage }) {
  if (!pkg.resources.mindmap?.nodes?.length) return <EmptyHint label="思维导图" />;
  return <ResourceMindMap pkg={pkg} />;
}

function TabContent({ pkg, tab, onNavigate }: {
  pkg: LearningResourcePackage;
  tab: TabKey | null;
  onNavigate: (prompt: string) => void;
}) {
  if (!tab) return <EmptyHint />;
  let content: ReactNode;
  switch (tab) {
    case "lecture": content = <LectureView pkg={pkg} />; break;
    case "mindmap": content = <MindmapView pkg={pkg} />; break;
    case "flashcard": content = <FlashcardView pkg={pkg} />; break;
    case "quiz": content = <QuizView pkg={pkg} />; break;
    case "code": content = <CodeView pkg={pkg} onNavigate={onNavigate} />; break;
  }
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
      <section className="min-w-0">{content}</section>
      <TutorPanel pkg={pkg} tab={tab} onNavigate={onNavigate} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Tutor Panel (sidebar)
// ═══════════════════════════════════════════════════════════════════════

function TutorPanel({
  pkg,
  tab,
  onNavigate,
}: {
  pkg: LearningResourcePackage;
  tab: TabKey;
  onNavigate: (prompt: string) => void;
}) {
  const meta = TAB_META[tab];
  const tabLabel = TABS.find((item) => item.key === tab)?.shortLabel || "资源";
  const topic = pkg.topic || pkg.title;
  const quickPrompts = [
    {
      label: meta.action,
      prompt: `我正在学习资源包「${pkg.title}」里的「${tabLabel}」。请围绕 408 考研口径，把「${topic}」讲清楚，并指出我现在最应该抓住的考点。`,
    },
    {
      label: "给我 3 道补练",
      prompt: `基于资源包「${pkg.title}」和当前「${tabLabel}」内容，给我 3 道 408 风格补练题。每题先不要直接给答案，等我作答后再解析。`,
    },
    {
      label: "整理错因",
      prompt: `我刚学完「${topic}」相关资源。请帮我按 408 常见错因整理：概念混淆、计算步骤、题干关键词、易错选项。`,
    },
  ];

  return (
    <aside className="order-first xl:order-none xl:sticky xl:top-[148px]">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card-solid)] p-4 shadow-[var(--shadow-soft)]">
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[rgba(59,130,246,0.1)] text-[var(--primary)]">
            <Sparkles size={17} />
          </div>
          <div>
            <h2 className="text-[15px] font-bold">学习建议</h2>
            <p className="mt-1 text-[12px] leading-5 text-[var(--muted-foreground)]">{meta.title}</p>
          </div>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)]/45 p-3">
          <p className="text-[12px] leading-5 text-[var(--foreground)]/80">{meta.detail}</p>
        </div>

        <div className="mt-4 space-y-2">
          {quickPrompts.map((item) => (
            <button
              key={item.label}
              onClick={() => onNavigate(item.prompt)}
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-left text-[12px] font-semibold hover:border-[var(--primary)] hover:text-[var(--primary)]"
            >
              <span>{item.label}</span>
              <Send size={13} className="shrink-0" />
            </button>
          ))}
        </div>

        <div className="mt-4 rounded-xl bg-[rgba(52,199,89,0.09)] px-3 py-2.5 text-[11px] leading-5 text-emerald-700 dark:text-emerald-300">
          当前主题：{topic}
        </div>
      </div>
    </aside>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Empty states
// ═══════════════════════════════════════════════════════════════════════

function EmptyHint({
  label,
  detail,
  action,
  onAction,
}: {
  label?: string;
  detail?: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card-solid)] px-6 py-16 text-center shadow-[var(--shadow-soft)]">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--muted)]">
        <Sparkles size={20} className="text-[var(--muted-foreground)]" />
      </div>
      <p className="text-[14px] font-semibold text-[var(--foreground)]">
        {label ? `${label}暂未生成` : "选择上方的资源类型开始学习"}
      </p>
      {detail ? <p className="max-w-md text-[12px] leading-6 text-[var(--muted-foreground)]">{detail}</p> : null}
      {action && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-2 rounded-xl bg-[var(--foreground)] px-4 py-2 text-[12px] font-semibold text-white hover:opacity-90"
        >
          {action}
        </button>
      ) : null}
    </div>
  );
}
