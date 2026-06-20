"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Boxes,
  Brain,
  CheckCircle2,
  Database,
  Route,
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
  type LearningProfile,
} from "@/lib/api";

const AGENTS = [
  { key: "orchestrator", label: "调度", role: "理解意图" },
  { key: "rag", label: "检索", role: "找知识依据" },
  { key: "profile", label: "诊断", role: "看你的水平" },
  { key: "path", label: "规划", role: "安排下一步" },
  { key: "resource", label: "生成", role: "出讲义和题" },
  { key: "feedback", label: "复盘", role: "更新画像" },
] as const;

const LOOP_STAGES = [
  { key: "retrieve", title: "检索知识", desc: "从你的教材里找相关段落" },
  { key: "profile", title: "诊断水平", desc: "看你会什么、不会什么" },
  { key: "path", title: "安排计划", desc: "告诉你接下来该学什么" },
  { key: "resource", title: "生成资源", desc: "出讲义、练习题、复习卡片" },
  { key: "remediate", title: "查漏补缺", desc: "根据错题再出新题" },
] as const;

const STAGE_ICON: Record<string, LucideIcon> = {
  retrieve: Database,
  profile: Brain,
  path: Route,
  resource: Wand2,
  remediate: CheckCircle2,
};

interface CapabilityCard {
  key: string;
  label: string;
  desc: string;
  href: string;
  icon: LucideIcon;
  tile: string;
  chip: string;
  metric: (d: OverviewData) => string;
}

const CAPABILITIES: CapabilityCard[] = [
  {
    key: "knowledge",
    label: "你的教材",
    desc: "上传 PDF/文档，系统自动切片、理解、记住",
    href: "/knowledge",
    icon: Database,
    tile: "bg-sky-50 hover:bg-sky-100/70 ring-sky-200/70",
    chip: "bg-sky-500/12 text-sky-700",
    metric: (d) => `${d.documents} 份文档`,
  },
  {
    key: "profile",
    label: "你的水平",
    desc: "通过做题和对话，系统记住你会什么、不会什么",
    href: "/profile",
    icon: UserRound,
    tile: "bg-violet-50 hover:bg-violet-100/70 ring-violet-200/70",
    chip: "bg-violet-500/12 text-violet-700",
    metric: (d) => `${d.profileScore}% 完整度`,
  },
  {
    key: "path",
    label: "学什么",
    desc: "根据你的弱项，告诉你下一步最该学什么",
    href: "/path",
    icon: Route,
    tile: "bg-amber-50 hover:bg-amber-100/70 ring-amber-200/70",
    chip: "bg-amber-500/15 text-amber-700",
    metric: (d) => (d.weakPoints.length ? `${d.weakPoints.length} 个弱项` : "等待反馈"),
  },
  {
    key: "resources",
    label: "学材料",
    desc: "讲义、练习题、复习卡片，一键生成",
    href: "/resources",
    icon: Boxes,
    tile: "bg-emerald-50 hover:bg-emerald-100/70 ring-emerald-200/70",
    chip: "bg-emerald-500/12 text-emerald-700",
    metric: (d) => `${d.resources} 个资源包`,
  },
];

interface OverviewData {
  documents: number;
  resources: number;
  profileScore: number;
  weakPoints: string[];
  loading: boolean;
}

function computeProfileScore(profile: LearningProfile | null): number {
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

export function SystemOverview() {
  const [data, setData] = useState<OverviewData>({
    documents: 0,
    resources: 0,
    profileScore: 0,
    weakPoints: [],
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [sessions, docs, packages] = await Promise.all([
        listSessions().catch(() => []),
        listKnowledgeDocuments().catch(() => []),
        listResourcePackages().catch(() => []),
      ]);
      if (cancelled) return;

      let profile: LearningProfile | null = null;
      if (sessions[0]?.id) {
        profile = await getLearningProfile(sessions[0].id).catch(() => null);
      }
      if (cancelled) return;

      setData({
        documents: docs.length,
        resources: packages.length,
        profileScore: computeProfileScore(profile),
        weakPoints: profile?.weak_points ?? [],
        loading: false,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <div className="mx-auto max-w-6xl px-6 py-8">
        {/* 顶栏 */}
        <header className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <BrandMark variant="logo" size={36} className="rounded-xl" />
            <div>
              <div className="text-[15px] font-bold tracking-tight">ZhiPath</div>
              <div className="text-[11px] text-stone-500">系统总览</div>
            </div>
          </div>
          <Link
            href="/chat"
            className="group inline-flex items-center gap-1.5 rounded-full bg-emerald-800 px-4 py-2 text-[12px] font-semibold text-white hover:bg-emerald-700"
          >
            进入学习工作台
            <ArrowRight size={14} className="transition group-hover:translate-x-0.5" />
          </Link>
        </header>

        {/* 便当网格 */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          {/* Hero tile — 深绿渐变 */}
          <div className="md:col-span-2 rounded-3xl bg-gradient-to-br from-emerald-700 to-teal-600 p-7 text-white shadow-lg shadow-emerald-700/15">
            <div className="text-[12px] font-medium uppercase tracking-[0.16em] text-white/70">
              多智能体学习系统
            </div>
            <h1 className="mt-3 text-[26px] font-bold leading-tight tracking-tight">
              你学什么、学得怎样，<br />系统帮你安排。
            </h1>
            <p className="mt-3 max-w-sm text-[13px] leading-6 text-white/80">
              上传教材 → 系统出题诊断 → 生成针对性讲义和练习 → 下次复习自动提醒。
            </p>
            <div className="mt-6 grid grid-cols-3 gap-3">
              <HeroStat value={data.documents} label="文档" />
              <HeroStat value={data.resources} label="资源" />
              <HeroStat value={`${data.profileScore}%`} label="画像" />
            </div>
          </div>

          {/* Pipeline tile — 深棕 */}
          <div className="md:col-span-2 rounded-3xl bg-stone-900 p-6 text-stone-100">
            <div className="mb-4 flex items-center justify-between">
              <div className="text-[14px] font-semibold">多智能体协作链路</div>
              <span className="rounded-full bg-emerald-400/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300 ring-1 ring-emerald-400/20">
                运行中
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {AGENTS.map((a) => {
                const active = a.key === "feedback";
                return (
                  <div
                    key={a.key}
                    className={`rounded-xl px-3 py-2 text-[12px] ${
                      active
                        ? "bg-teal-400/15 text-teal-200 ring-1 ring-teal-400/30"
                        : "bg-white/[0.05] text-stone-200"
                    }`}
                  >
                    <span
                      className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${
                        active ? "animate-pulse bg-teal-300" : "bg-emerald-400"
                      }`}
                    />
                    {a.label}
                  </div>
                );
              })}
            </div>
            <div className="mt-4 text-[11px] leading-5 text-stone-400">
              收到你的问题 → 检索知识库 → 分析你的水平 → 找出薄弱点 → 生成针对性资源 → 做题后更新画像。
            </div>
          </div>

          {/* 4 个能力 tile */}
          {CAPABILITIES.map((c) => {
            const Icon = c.icon;
            return (
              <Link
                key={c.key}
                href={c.href}
                className={`group rounded-3xl p-5 ring-1 transition ${c.tile}`}
              >
                <div className="mb-4 flex items-center justify-between">
                  <div
                    className={`flex h-11 w-11 items-center justify-center rounded-2xl ${c.chip}`}
                  >
                    <Icon size={19} />
                  </div>
                  <ArrowUpRight
                    size={16}
                    className="text-stone-400 transition group-hover:translate-x-0.5 group-hover:text-stone-700"
                  />
                </div>
                <div className="text-[15px] font-bold tracking-tight">{c.label}</div>
                <div className="mt-1 text-[11px] leading-5 text-stone-600">{c.desc}</div>
                <div className="mt-3 text-[12px] font-semibold text-stone-700">
                  {c.metric(data)}
                </div>
              </Link>
            );
          })}

          {/* 流程 tile */}
          <div className="md:col-span-4 rounded-3xl bg-white p-6 ring-1 ring-stone-200/70">
            <div className="mb-4 flex items-center gap-2">
              <span className="text-[14px] font-bold tracking-tight">核心流程</span>
              <span className="text-[12px] text-stone-400">五步学习闭环</span>
            </div>
            <div className="flex items-center gap-1 overflow-x-auto pb-1">
              {LOOP_STAGES.map((stage, i) => {
                const Icon = STAGE_ICON[stage.key];
                return (
                  <div key={stage.key} className="flex items-center gap-1">
                    <div className="min-w-[150px] rounded-2xl bg-stone-50 px-4 py-3 ring-1 ring-stone-200/60">
                      <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-600 to-teal-500 text-white">
                        <Icon size={16} />
                      </div>
                      <div className="text-[13px] font-semibold">{stage.title}</div>
                      <div className="mt-0.5 text-[11px] leading-4 text-stone-500">
                        {stage.desc}
                      </div>
                    </div>
                    {i < LOOP_STAGES.length - 1 && (
                      <ArrowRight size={16} className="shrink-0 text-stone-300" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function HeroStat({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="rounded-2xl bg-white/10 px-3 py-2.5 backdrop-blur-sm">
      <div className="text-[22px] font-bold leading-none tabular-nums">{value}</div>
      <div className="mt-1 text-[11px] text-white/70">{label}</div>
    </div>
  );
}
