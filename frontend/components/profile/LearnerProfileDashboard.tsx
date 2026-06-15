"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, FileText, Loader2, MessageCircle, Route } from "lucide-react";
import {
  getLearningProfile,
  listSessions,
  type LearningProfile,
  type ProfileEvidenceEntry,
  type ProfileInsightCard,
  type SessionSummary,
} from "@/lib/api";

const DIMENSION_LABEL: Record<string, string> = {
  learning_goal: "学习目标",
  level: "当前基础",
  topics: "关注主题",
  weak_points: "薄弱点",
  preferences: "学习方式",
  constraints: "时间约束",
  recent_intents: "近期意图",
  exam_context: "408 场景",
  exam_daily_hours: "每日学习时间",
  exam_weak_subject: "408 弱项",
  exam_exam_stage: "复习阶段",
  exam_exam_date: "考试时间",
  exam_target_school: "目标学校",
  exam_exam_code: "考试代码",
};

const SOURCE_LABEL: Record<string, string> = {
  agentic: "智能路由",
  chat: "对话记录",
  goal: "目标记录",
  learning: "路径记录",
  resource_gen: "资源生成",
  auto_tutor: "学习编排",
  explainer: "讲解记录",
  quiz: "练习反馈",
};

type TodayItem = {
  title: string;
  detail: string;
  tag: string;
  target: string;
};

export function LearnerProfileDashboard() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [profile, setProfile] = useState<LearningProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    listSessions()
      .then((data) => {
        if (cancelled) return;
        setSessions(data);
        setSelectedSessionId(data[0]?.id || "");
      })
      .catch(() => {
        if (!cancelled) setError("会话加载失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedSessionId) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    getLearningProfile(selectedSessionId)
      .then((data) => {
        if (!cancelled) setProfile(data);
      })
      .catch(() => {
        if (!cancelled) setError("情况加载失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedSessionId]);

  const selectedSession = useMemo(
    () => sessions.find((item) => item.id === selectedSessionId),
    [sessions, selectedSessionId],
  );

  return (
    <main className="min-h-screen bg-[#f5f5f7] text-[#1d1d1f]">
      <header className="sticky top-0 z-30 border-b border-black/[0.06] bg-[#f5f5f7]/95">
        <div className="mx-auto flex h-[72px] max-w-[1180px] items-center justify-between gap-4 px-5">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/chat"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-black/[0.08] bg-white text-[#6e6e73] shadow-sm transition hover:text-[#1d1d1f]"
              title="返回工作台"
            >
              <ArrowLeft size={16} />
            </Link>
            <div className="min-w-0">
              <p className="text-[12px] font-semibold text-[#007aff]">408 复习</p>
              <h1 className="truncate text-[22px] font-semibold tracking-tight">我的情况</h1>
            </div>
          </div>
          <SessionPicker sessions={sessions} value={selectedSessionId} onChange={setSelectedSessionId} />
        </div>
      </header>

      <div className="mx-auto max-w-[1180px] px-5 py-6">
        {loading && !profile ? (
          <LoadingState />
        ) : error ? (
          <p className="rounded-[22px] border border-red-200 bg-red-50 p-6 text-center text-sm text-red-600">
            {error}
          </p>
        ) : !profile ? (
          <EmptyState />
        ) : (
          <ProfileContent profile={profile} sessionTitle={selectedSession?.title || ""} />
        )}
      </div>
    </main>
  );
}

function ProfileContent({
  profile,
  sessionTitle,
}: {
  profile: LearningProfile;
  sessionTitle: string;
}) {
  const evidence = [...(profile.evidence_log ?? [])].reverse().slice(0, 4);
  const coverage = profile.dimension_coverage;
  const coverageScore = coverage?.score ?? 0;
  const coverageTotal = coverage?.total ?? 8;
  const coveragePercent = Math.round((coverage?.ratio ?? 0) * 100);
  const todayItems = buildTodayItems(profile);
  const lead = todayItems[0];

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-5">
        <section className="rounded-[28px] border border-black/[0.08] bg-white p-7 shadow-[0_18px_42px_rgba(0,0,0,0.06)]">
          <div className="flex items-start justify-between gap-6">
            <div className="min-w-0">
              <h2 className="max-w-3xl text-[34px] font-semibold leading-[1.18] tracking-[-0.04em]">
                {lead ? `先做：${lead.target}` : "先补充你的 408 情况"}
              </h2>
              <p className="mt-3 max-w-2xl text-[15px] leading-7 text-[#6e6e73]">
                {profile.profile_insights?.summary ||
                  "系统会根据你最近的对话、练习和资源使用记录安排下一步。没有记录的内容不会当作结论展示。"}
              </p>
            </div>
            <CoverageRing score={coverageScore} total={coverageTotal} percent={coveragePercent} />
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-4">
            <Fact label="目标" value={mainGoal(profile)} />
            <Fact label="薄弱点" value={joinValues(profile.weak_points, weakFromExam(profile))} />
            <Fact label="每天" value={dailyTime(profile)} />
            <Fact label="方式" value={joinValues(profile.preferences, "待补")} />
          </div>
        </section>

        <section className="rounded-[28px] border border-black/[0.08] bg-white p-6 shadow-[0_18px_42px_rgba(0,0,0,0.06)]">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-[22px] font-semibold tracking-tight">今天先做</h2>
              <p className="mt-1 text-[13px] text-[#8e8e93]">最多 3 件事，来自当前真实记录</p>
            </div>
            <span className="rounded-full bg-[#f2f2f7] px-3 py-1 text-[12px] text-[#6e6e73]">
              {profile.profile_insights?.evidence_total ?? profile.evidence_log?.length ?? 0} 条依据
            </span>
          </div>

          <div className="space-y-3">
            {todayItems.map((item, index) => (
              <TodayRow key={`${item.title}-${index}`} index={index + 1} item={item} />
            ))}
          </div>
        </section>

        <section className="rounded-[28px] border border-black/[0.08] bg-white p-6 shadow-[0_18px_42px_rgba(0,0,0,0.06)]">
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 className="text-[22px] font-semibold tracking-tight">依据</h2>
            <span className="text-[13px] text-[#8e8e93]">只展示已记录的信息</span>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {reasonCards(profile).map((item) => (
              <ReasonCard key={item.title} title={item.title} body={item.body} source={item.source} />
            ))}
          </div>
        </section>
      </div>

      <aside className="space-y-5">
        <section className="rounded-[28px] border border-black/[0.08] bg-white p-5 shadow-[0_18px_42px_rgba(0,0,0,0.06)]">
          <h2 className="text-[20px] font-semibold tracking-tight">可以改</h2>
          <div className="mt-4 divide-y divide-[#f2f2f7]">
            <SideRow label="目标" value={mainGoal(profile)} />
            <SideRow label="关注主题" value={joinValues(profile.topics, "待补")} />
            <SideRow label="薄弱点" value={joinValues(profile.weak_points, weakFromExam(profile))} />
            <SideRow label="学习方式" value={joinValues(profile.preferences, "待补")} />
          </div>
          <Link
            href={`/chat?p=${encodeURIComponent("我想修改我的 408 复习情况")}`}
            className="mt-5 flex h-11 items-center justify-center rounded-[14px] bg-[#007aff] text-[14px] font-semibold text-white"
          >
            修改
          </Link>
        </section>

        <section className="rounded-[28px] border border-black/[0.08] bg-white p-5 shadow-[0_18px_42px_rgba(0,0,0,0.06)]">
          <h2 className="text-[20px] font-semibold tracking-tight">最近记录</h2>
          <div className="mt-4 space-y-3">
            {evidence.length ? (
              evidence.map((item, index) => <EvidenceItem key={`${item.turn}-${item.dimension}-${index}`} item={item} />)
            ) : (
              <p className="rounded-[18px] bg-[#f8f8fa] p-4 text-[13px] leading-6 text-[#6e6e73]">
                还没有足够记录。先说出你的目标、薄弱点和每天可学时间。
              </p>
            )}
          </div>
        </section>

        <section className="grid gap-3">
          <QuickLink
            href={`/resources?topic=${encodeURIComponent(lead?.target || mainGoal(profile))}`}
            icon={<FileText size={17} />}
            title="生成资源"
            subtitle="按当前薄弱点出题"
          />
          <QuickLink href="/path" icon={<Route size={17} />} title="学习路径" subtitle="重排今天顺序" />
          <QuickLink
            href={`/chat?p=${encodeURIComponent(`根据我的当前情况，解释 ${lead?.target || "408"} 并给我下一步建议`)}`}
            icon={<MessageCircle size={17} />}
            title="问导师"
            subtitle="带着当前情况提问"
          />
        </section>
      </aside>
    </div>
  );
}

function CoverageRing({ score, total, percent }: { score: number; total: number; percent: number }) {
  return (
    <div
      className="grid h-[124px] w-[124px] shrink-0 place-items-center rounded-full"
      style={{ background: `conic-gradient(#007aff 0 ${percent}%, #ececf1 ${percent}% 100%)` }}
    >
      <div className="grid h-[94px] w-[94px] place-items-center rounded-full bg-white text-center shadow-[inset_0_0_0_1px_#f2f2f7]">
        <div>
          <b className="text-[28px] leading-none tracking-[-0.04em]">
            {score}/{total}
          </b>
          <span className="mt-1 block text-[12px] text-[#8e8e93]">已记录</span>
        </div>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] bg-[#f8f8fa] p-4">
      <span className="block text-[12px] text-[#8e8e93]">{label}</span>
      <b className="mt-2 block truncate text-[17px]">{value}</b>
    </div>
  );
}

function TodayRow({ index, item }: { index: number; item: TodayItem }) {
  return (
    <div className="grid grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-4 rounded-[20px] bg-[#f8f8fa] p-4">
      <span className="grid h-[34px] w-[34px] place-items-center rounded-full bg-[#1d1d1f] text-[13px] font-bold text-white">
        {index}
      </span>
      <div className="min-w-0">
        <h3 className="truncate text-[17px] font-semibold">{item.title}</h3>
        <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-[#6e6e73]">{item.detail}</p>
      </div>
      <span className="rounded-full bg-[#eef6ff] px-3 py-1.5 text-[12px] font-semibold text-[#007aff]">
        {item.tag}
      </span>
    </div>
  );
}

function ReasonCard({ title, body, source }: { title: string; body: string; source: string }) {
  return (
    <article className="min-h-[132px] rounded-[20px] bg-[#f8f8fa] p-4">
      <b className="block text-[15px]">{title}</b>
      <p className="mt-2 text-[13px] leading-6 text-[#6e6e73]">{body}</p>
      <span className="mt-3 inline-flex rounded-full bg-[#f2f2f7] px-2.5 py-1 text-[12px] text-[#6e6e73]">
        {source}
      </span>
    </article>
  );
}

function SideRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <span className="text-[13px] text-[#8e8e93]">{label}</span>
      <b className="max-w-[190px] truncate text-right text-[14px]">{value}</b>
    </div>
  );
}

function EvidenceItem({ item }: { item: ProfileEvidenceEntry }) {
  return (
    <article className="border-l-2 border-[#007aff]/25 pl-3">
      <b className="text-[13px] text-[#007aff]">
        第 {item.turn} 轮 · {DIMENSION_LABEL[item.dimension] || item.dimension}
      </b>
      <p className="mt-1 line-clamp-3 text-[13px] leading-5 text-[#6e6e73]">{item.snippet || item.value}</p>
    </article>
  );
}

function QuickLink({
  href,
  icon,
  title,
  subtitle,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-[20px] border border-black/[0.08] bg-white p-4 shadow-sm transition hover:border-black/15"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#f5f5f7] text-[#1d1d1f]">
        {icon}
      </span>
      <span className="min-w-0">
        <b className="block text-[14px]">{title}</b>
        <span className="block truncate text-[12px] text-[#8e8e93]">{subtitle}</span>
      </span>
      <ArrowRight size={15} className="ml-auto text-[#c7c7cc]" />
    </Link>
  );
}

function SessionPicker({
  sessions,
  value,
  onChange,
}: {
  sessions: SessionSummary[];
  value: string;
  onChange: (id: string) => void;
}) {
  if (!sessions.length) return <span className="text-[12px] text-[#8e8e93]">尚无会话</span>;
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="max-w-[360px] rounded-full border border-black/[0.08] bg-white px-4 py-2.5 text-[13px] text-[#1d1d1f] shadow-sm outline-none focus:border-[#007aff]"
    >
      {sessions.map((item) => (
        <option key={item.id} value={item.id}>
          {item.title || item.id.slice(0, 8)}
        </option>
      ))}
    </select>
  );
}

function LoadingState() {
  return (
    <div className="flex h-[420px] items-center justify-center rounded-[28px] border border-black/[0.08] bg-white">
      <Loader2 size={22} className="animate-spin text-[#007aff]" />
    </div>
  );
}

function EmptyState() {
  return (
    <section className="rounded-[28px] border border-black/[0.08] bg-white p-10 text-center shadow-[0_18px_42px_rgba(0,0,0,0.06)]">
      <h2 className="text-[24px] font-semibold tracking-tight">还没有记录</h2>
      <p className="mx-auto mt-2 max-w-md text-[14px] leading-6 text-[#6e6e73]">
        先和导师说出你的 408 目标、薄弱点和每天可学时间。
      </p>
      <Link
        href="/chat"
        className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#007aff] px-5 py-2 text-[13px] font-semibold text-white"
      >
        去对话
        <ArrowRight size={14} />
      </Link>
    </section>
  );
}

function buildTodayItems(profile: LearningProfile): TodayItem[] {
  const cards = profile.profile_insights?.cards ?? [];
  const fromCards = cards
    .filter((card) => card.action || card.title)
    .slice(0, 3)
    .map((card) => ({
      title: card.action || card.title,
      detail: card.rationale || "来自当前记录。",
      tag: card.dimension || "依据",
      target: card.target || card.title,
    }));

  if (fromCards.length) return fromCards;

  const weak = joinValues(profile.weak_points, weakFromExam(profile));
  const topic = joinValues(profile.topics, "408");
  const preference = joinValues(profile.preferences, "按当前记录学习");
  return [
    {
      title: weak === "待补" ? "补充薄弱点" : `先处理 ${weak}`,
      detail: weak === "待补" ? "当前还没有明确薄弱点。" : "来自你记录的薄弱方向。",
      tag: "薄弱点",
      target: weak,
    },
    {
      title: `围绕 ${topic} 生成资源`,
      detail: "根据当前关注主题进入资源生成。",
      tag: "主题",
      target: topic,
    },
    {
      title: preference === "待补" ? "补充学习方式" : `采用 ${preference}`,
      detail: "后续题目、讲义和路径会按这个方式组织。",
      tag: "方式",
      target: preference,
    },
  ];
}

function reasonCards(profile: LearningProfile) {
  const cards = profile.profile_insights?.cards ?? [];
  if (cards.length) {
    return cards.slice(0, 3).map((card) => ({
      title: card.dimension || card.title,
      body: card.rationale || card.action || "来自当前记录。",
      source: sourceText(card),
    }));
  }
  return [
    {
      title: "目标",
      body: mainGoal(profile) === "待补" ? "当前还没有明确目标。" : `当前目标记录为：${mainGoal(profile)}。`,
      source: "画像记录",
    },
    {
      title: "薄弱点",
      body:
        joinValues(profile.weak_points, weakFromExam(profile)) === "待补"
          ? "当前还没有明确薄弱点。"
          : `当前薄弱点记录为：${joinValues(profile.weak_points, weakFromExam(profile))}。`,
      source: "画像记录",
    },
    {
      title: "时间",
      body: dailyTime(profile) === "待补" ? "当前还没有每日学习时间。" : `每日学习时间记录为：${dailyTime(profile)}。`,
      source: "画像记录",
    },
  ];
}

function sourceText(card: ProfileInsightCard) {
  if (!card.sources?.length) return "画像记录";
  return card.sources.map((source) => SOURCE_LABEL[source] || source).slice(0, 2).join("、");
}

function mainGoal(profile: LearningProfile) {
  return textOr(profile.learning_goal || profile.exam_context?.exam_code, "待补");
}

function dailyTime(profile: LearningProfile) {
  const hours = profile.exam_context?.daily_hours;
  if (hours) return `${hours} 小时`;
  return joinValues(profile.constraints, "待补");
}

function weakFromExam(profile: LearningProfile) {
  const weakSubjects = profile.exam_context?.weak_subjects;
  return Array.isArray(weakSubjects) && weakSubjects.length ? weakSubjects.join("、") : "待补";
}

function joinValues(values: unknown, fallback: string) {
  if (Array.isArray(values)) {
    const clean = values.map((item) => String(item).trim()).filter(Boolean);
    return clean.length ? clean.slice(0, 3).join("、") : fallback;
  }
  return textOr(values, fallback);
}

function textOr(value: unknown, fallback: string) {
  const text = String(value ?? "").trim();
  return text || fallback;
}
