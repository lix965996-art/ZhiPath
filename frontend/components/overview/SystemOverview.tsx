"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Boxes,
  Brain,
  CheckCircle2,
  Database,
  FileText,
  Layers3,
  Network,
  Route,
  Sparkles,
  Target,
  UserRound,
  Wand2,
  type LucideIcon,
} from "lucide-react";
import { BrandMark } from "@/components/brand/BrandMark";
import {
  getLearningProfile,
  listKnowledgeDocuments,
  listResourcePackages,
  listSessions,
  searchKnowledge,
  type KnowledgeDocumentSummary,
  type KnowledgeSearchResult,
  type LearningProfile,
  type LearningResourcePackage,
  type SessionSummary,
} from "@/lib/api";
import { AgentWorkflowGraph } from "@/components/agent/AgentWorkflowGraph";

interface CapabilityCard {
  description: string;
  href: string;
  icon: LucideIcon;
  label: string;
  metric: string;
  status: string;
}

export function SystemOverview() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [documents, setDocuments] = useState<KnowledgeDocumentSummary[]>([]);
  const [packages, setPackages] = useState<LearningResourcePackage[]>([]);
  const [profile, setProfile] = useState<LearningProfile | null>(null);
  const [searchResult, setSearchResult] = useState<KnowledgeSearchResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const [nextSessions, nextDocuments, nextPackages, nextSearch] =
        await Promise.all([
          listSessions().catch(() => []),
          listKnowledgeDocuments().catch(() => []),
          listResourcePackages().catch(() => []),
          searchKnowledge("动态规划状态转移", 1).catch(() => []),
        ]);
      if (cancelled) return;
      setSessions(nextSessions);
      setDocuments(nextDocuments);
      setPackages(nextPackages);
      setSearchResult(nextSearch[0] || null);
      if (nextSessions[0]?.id) {
        const nextProfile = await getLearningProfile(nextSessions[0].id).catch(() => null);
        if (!cancelled) setProfile(nextProfile);
      }
      if (!cancelled) setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const profileScore = useMemo(() => getProfileScore(profile), [profile]);
  const latestPackage = packages[0];
  const loopStages: Array<{
    desc: string;
    icon: LucideIcon;
    title: string;
  }> = [
    { title: "知识库检索", desc: "pgvector 召回知识依据", icon: Database },
    { title: "画像更新", desc: "抽取目标、弱项和偏好", icon: Brain },
    { title: "路径规划", desc: "生成阶段任务和验收标准", icon: Route },
    { title: "资源生成", desc: "沉淀讲义、试卷和卡片", icon: Wand2 },
    { title: "补救迭代", desc: "根据错题生成下一轮任务", icon: CheckCircle2 },
  ];
  const capabilities: CapabilityCard[] = [
    {
      label: "语义知识库",
      description: "文档切片、向量入库、pgvector 相似度召回。",
      href: "/knowledge",
      icon: Database,
      metric: `${documents.length} 份文档`,
      status: searchResult?.retrieval_mode || "待检索",
    },
    {
      label: "学习者画像",
      description: "从对话和测验中提取目标、水平、弱项和偏好。",
      href: "/profile",
      icon: UserRound,
      metric: `${profileScore}% 完整度`,
      status: profile?.level || "待诊断",
    },
    {
      label: "学习路径",
      description: "把画像、资源和反馈组织成可验收阶段。",
      href: "/path",
      icon: Route,
      metric: profile?.weak_points.length ? `${profile.weak_points.length} 个弱项` : "等待反馈",
      status: profile?.learning_goal ? "已建立目标" : "目标待明确",
    },
    {
      label: "资源工坊",
      description: "沉淀讲义、题目、试卷、卡片和知识结构。",
      href: "/resources",
      icon: Boxes,
      metric: `${packages.length} 个资源包`,
      status: latestPackage?.topic || "待生成",
    },
  ];

  return (
    <main className="lf-scrollbar h-screen overflow-y-auto bg-[var(--background)] text-[var(--foreground)]">
      <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-white/75 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <BrandMark variant="logo" size={36} className="rounded-xl" />
            <div>
              <div className="text-[15px] font-semibold">系统总览</div>
              <div className="text-[12px] text-[var(--muted-foreground)]">
                多智能体学习闭环
              </div>
            </div>
          </div>
          <Link
            href="/chat"
            className="inline-flex items-center gap-1.5 rounded-full bg-[var(--primary)] px-3 py-2 text-[12px] font-medium text-white shadow-sm hover:bg-[var(--primary-dark)]"
          >
            进入学习工作台
            <ArrowRight size={14} />
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-8">
        <section className="mb-8 grid gap-5 lg:grid-cols-[minmax(0,0.95fr)_minmax(380px,1.05fr)]">
          <div className="rounded-[34px] border border-[var(--border)] bg-white/88 p-8 shadow-[var(--shadow-soft)]">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-[rgba(0,122,255,0.08)] px-3 py-1.5 text-[12px] font-medium text-[var(--primary)]">
            <Sparkles size={14} />
            学习闭环已就绪
          </div>
          <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-end">
            <div>
              <h1 className="max-w-2xl text-[30px] font-semibold leading-tight md:text-[42px]">
                一条清晰的学习路径。
              </h1>
              <p className="mt-4 max-w-2xl text-[15px] leading-7 text-[var(--muted-foreground)]">
                ZhiPath 只关注一件事：理解学生，生成合适资源，再根据答题反馈调整下一步。
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Metric label="文档" value={documents.length} />
              <Metric label="资源" value={packages.length} />
              <Metric label="画像" value={`${profileScore}%`} />
            </div>
          </div>
          </div>
          <AgentWorkflowGraph
            hasFeedback={Boolean(profile?.quiz_accuracy)}
            hasKnowledge={documents.length > 0}
            hasProfile={profileScore > 0}
            hasResource={packages.length > 0}
            isStreaming={false}
          />
        </section>

        <section className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {capabilities.map((capability) => (
            <Link
              key={capability.href}
              href={capability.href}
              className="lf-lift rounded-[28px] border border-[var(--border)] bg-white/86 p-5 shadow-[var(--shadow-soft)]"
            >
              <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-[rgba(0,122,255,0.1)] text-[var(--primary)]">
                <capability.icon size={20} />
              </div>
              <div className="text-[15px] font-semibold">{capability.label}</div>
              <div className="mt-1 text-[12px] leading-5 text-[var(--muted-foreground)]">
                {capability.description}
              </div>
              <div className="mt-4 flex items-center justify-between text-[12px]">
                <span className="font-medium text-[var(--primary)]">{capability.metric}</span>
                <ArrowRight size={14} className="text-[var(--muted-foreground)]" />
              </div>
            </Link>
          ))}
        </section>

        <section className="rounded-[34px] border border-[var(--border)] bg-white/88 p-6 shadow-[var(--shadow-soft)]">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <div className="text-[16px] font-semibold">核心流程</div>
              <div className="mt-1 text-[12px] text-[var(--muted-foreground)]">
                默认只看主线，需要细节再进入对应页面。
              </div>
            </div>
            <span className="rounded-full bg-[var(--muted)] px-3 py-1.5 text-[12px] text-[var(--muted-foreground)]">
              {searchResult?.retrieval_mode || (loading ? "检测中" : "待检索")}
            </span>
          </div>
          <div className="grid gap-3 md:grid-cols-5">
            {loopStages.map(({ desc, icon: Icon, title }) => (
              <div key={title} className="rounded-[22px] bg-[var(--muted)] px-3 py-4">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-[var(--primary)]">
                    <Icon size={16} />
                </div>
                <div className="text-[13px] font-semibold">{title}</div>
                <div className="mt-1 text-[11px] leading-5 text-[var(--muted-foreground)]">{desc}</div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl bg-[var(--muted)] px-3 py-3">
      <div className="text-[22px] font-semibold text-[var(--foreground)]">{value}</div>
      <div className="mt-0.5 text-[11px] text-[var(--muted-foreground)]">{label}</div>
    </div>
  );
}

function Signal({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="flex gap-3 rounded-2xl bg-[var(--muted)] px-3 py-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-[var(--primary)]">
        <Icon size={16} />
      </div>
      <div className="min-w-0">
        <div className="text-[11px] text-[var(--muted-foreground)]">{label}</div>
        <div className="mt-0.5 line-clamp-2 text-[13px] font-medium">{value}</div>
      </div>
    </div>
  );
}

function getProfileScore(profile: LearningProfile | null) {
  if (!profile) return 0;
  const checks = [
    Boolean(profile.learning_goal),
    Boolean(profile.level),
    profile.topics.length > 0,
    profile.weak_points.length > 0,
    profile.preferences.length > 0,
    profile.recent_intents.length > 0,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}
