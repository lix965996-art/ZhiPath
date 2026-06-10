"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Code2,
  FileText,
  HelpCircle,
  Loader2,
  Network,
  Package,
  PlayCircle,
  Plus,
  RefreshCw,
  Search,
  Target,
  type LucideIcon,
} from "lucide-react";
import {
  getLearningProfile,
  getPathRevisions,
  listResourcePackages,
  listSessions,
  type LearningProfile,
  type LearningResourcePackage,
  type PathRevisionRecord,
  type SessionSummary,
} from "@/lib/api";
import { MountainPath } from "./MountainPath";

interface PathStage {
  id: string;
  title: string;
  status: "done" | "active" | "pending";
  objective: string;
  basis: string;
  tasks: string[];
  outputs: string[];
  acceptance: string;
  icon: LucideIcon;
  // 通过后进入什么阶段
  transitionNext: string;
  // 顶部状态短句 (按阶段不同, Camp 1 = 建立画像, Camp 5/6 = 已触发重规划)
  statusMessage: string;
  // 路线变化痕迹 (地图分叉虚线旁的小标签)
  routeChange?: { original: string; updated: string };
}

/**
 * 学习路径页 · 登山地图重做版
 *
 * 核心: 中央一张地形图 (6 营地 + 蜿蜒山路 + 顶峰) + 下方扁平当前营地详情.
 * 左侧会话列表收掉, 改顶部下拉.
 * Hero 重复信息全删, 顶上只剩 breadcrumb + 进度环.
 */
export function LearningPathTimeline() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [profile, setProfile] = useState<LearningProfile | null>(null);
  const [packages, setPackages] = useState<LearningResourcePackage[]>([]);
  const [revisions, setRevisions] = useState<PathRevisionRecord[]>([]);
  const [revisionCount, setRevisionCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pickedStageId, setPickedStageId] = useState<string | null>(null);

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
    if (!selectedSessionId) {
      setProfile(null);
      setPackages([]);
      setRevisions([]);
      setRevisionCount(0);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([
      getLearningProfile(selectedSessionId).catch(() => null),
      listResourcePackages(selectedSessionId).catch(() => []),
      getPathRevisions(selectedSessionId).catch(() => ({ count: 0, revisions: [] as PathRevisionRecord[], session_id: selectedSessionId })),
    ])
      .then(([nextProfile, nextPackages, revs]) => {
        if (cancelled) return;
        setProfile(nextProfile);
        setPackages(nextPackages);
        setRevisions(revs.revisions);
        setRevisionCount(revs.count);
        setPickedStageId(null);
      })
      .catch(() => {
        if (!cancelled) setError("学习路径加载失败");
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
    [selectedSessionId, sessions],
  );
  const stages = useMemo(
    () => buildPathStages(profile, packages),
    [profile, packages],
  );
  const activeStage = useMemo(() => {
    if (pickedStageId) {
      const found = stages.find((s) => s.id === pickedStageId);
      if (found) return found;
    }
    return (
      stages.find((stage) => stage.status === "active") ||
      stages.find((stage) => stage.status === "pending") ||
      stages[0]
    );
  }, [pickedStageId, stages]);

  // 进度按 active ordinal 算: Camp N active → N/6, 全完成 → 6/6
  const activeIdxForRing = stages.findIndex((s) => s.status === "active");
  const ordinalNum = activeIdxForRing >= 0 ? activeIdxForRing + 1 : stages.length;
  const totalCount = stages.length;
  const ratio = totalCount ? ordinalNum / totalCount : 0;

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      {/* 顶部 sticky header: breadcrumb + 会话下拉 + 进度环 + 返回 */}
      <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--surface)] backdrop-blur-2xl">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/chat"
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-[12px] text-[var(--foreground)] hover:bg-[var(--muted)]"
            >
              <ArrowLeft size={13} />
              返回工作台
            </Link>
            <div className="hidden h-4 w-px bg-[var(--border)] sm:block" />
            <SessionPicker
              sessions={sessions}
              value={selectedSessionId}
              onChange={setSelectedSessionId}
              currentTitle={selectedSession?.title}
            />
          </div>
          <ProgressRing ratio={ratio} done={ordinalNum} total={totalCount} />
        </div>
      </header>

      <div className="mx-auto max-w-5xl space-y-5 px-4 pt-6 pb-12">
        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
            {error}
          </div>
        ) : null}

        {loading && !profile ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 size={20} className="animate-spin text-[#5d6e57]" />
          </div>
        ) : (
          <>
            {/* 登山地图 */}
            <MountainPath
              stages={stages.map((s) => ({
                id: s.id,
                title: s.title,
                status: s.status,
                taskCount: s.tasks?.length ?? 3,
                routeChange: s.routeChange,
              }))}
              learningGoal={profile?.learning_goal}
              onPick={(id) => setPickedStageId(id)}
            />

            {/* 当前营地详情 (扁平 + AI 决策依据 + 营地补给) */}
            {activeStage ? (
              <CurrentCampDetail
                stage={activeStage}
                ordinal={stages.indexOf(activeStage) + 1}
                profile={profile}
                packages={packages}
                sessionId={selectedSessionId}
                revisions={revisions}
                revisionCount={revisionCount}
              />
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}

// ===== 顶部会话下拉 =====
function SessionPicker({
  sessions,
  value,
  onChange,
  currentTitle,
}: {
  sessions: SessionSummary[];
  value: string;
  onChange: (id: string) => void;
  currentTitle?: string;
}) {
  if (!sessions.length) {
    return (
      <span className="text-[12px] text-[var(--muted-foreground)]">尚无会话</span>
    );
  }
  return (
    <div className="relative min-w-0">
      <ChevronDown
        size={13}
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]"
      />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="max-w-[min(58vw,360px)] cursor-pointer truncate appearance-none rounded-full border border-[var(--border)] bg-[var(--card-solid)] py-1.5 pl-3 pr-8 text-[12.5px] font-medium text-[var(--foreground)] outline-none focus:border-[var(--primary)]"
        title={currentTitle}
      >
        {sessions.map((s) => (
          <option key={s.id} value={s.id}>
            {s.title || s.id.slice(0, 8)}
          </option>
        ))}
      </select>
    </div>
  );
}

// ===== 进度环 =====
function ProgressRing({ ratio, done, total }: { ratio: number; done: number; total: number }) {
  const r = 16;
  const c = 2 * Math.PI * r;
  const dash = c * (1 - ratio);
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-10 w-10">
        <svg viewBox="0 0 40 40" className="absolute inset-0 -rotate-90">
          <defs>
            <linearGradient id="lf-ring-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#007AFF" />
              <stop offset="100%" stopColor="#a78bfa" />
            </linearGradient>
          </defs>
          <circle cx="20" cy="20" r={r} fill="none" stroke="rgba(148,163,184,0.25)" strokeWidth="3" />
          <circle
            cx="20"
            cy="20"
            r={r}
            fill="none"
            stroke="url(#lf-ring-grad)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={dash}
            style={{ transition: "stroke-dashoffset 700ms cubic-bezier(0.22,1,0.36,1)" }}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center font-mono text-[10px] font-semibold text-[var(--foreground)]">
          {done}/{total}
        </span>
      </div>
      <div className="hidden sm:block">
        <div className="text-[10.5px] text-[var(--muted-foreground)]">
          学习进度
        </div>
        <div className="text-[11.5px] font-medium text-[var(--foreground)]">
          已到 Camp {done} · {Math.round(ratio * 100)}%
        </div>
      </div>
    </div>
  );
}

// ===== 当前营地详情 (扁平, 不嵌套) =====
function CurrentCampDetail({
  stage,
  ordinal,
  profile,
  packages,
  sessionId,
  revisions,
  revisionCount,
}: {
  stage: PathStage;
  ordinal: number;
  profile: LearningProfile | null;
  packages: LearningResourcePackage[];
  sessionId: string;
  revisions: PathRevisionRecord[];
  revisionCount: number;
}) {
  const Icon = stage.icon;
  const statusLabel = {
    active: "当前营地",
    done: "已抵达",
    pending: "待出发",
  }[stage.status];
  const statusColor = {
    active: "#a78bfa",        // 紫 = 当前
    done: "#007AFF",          // iOS 蓝 = 完成
    pending: "#94a3b8",       // slate = 待
  }[stage.status];

  return (
    <section className="overflow-hidden rounded-[24px] border border-[var(--border)] bg-[var(--card)] backdrop-blur">
      {/* 营地头条 */}
      <div className="flex flex-wrap items-center gap-3 border-b border-[var(--border)] px-5 py-3">
        <span
          className="inline-flex h-8 w-8 items-center justify-center rounded-xl"
          style={{ background: `${statusColor}1f`, color: statusColor }}
        >
          <Icon size={16} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-[var(--muted-foreground)]">
            Camp {ordinal} · {statusLabel}
          </p>
          <h2 className="truncate text-[16px] font-semibold text-[var(--foreground)]">{stage.title}</h2>
        </div>
        <span
          className="rounded-full px-3 py-1 text-[11px] font-medium"
          style={{ background: `${statusColor}1a`, color: statusColor }}
        >
          {statusLabel}
        </span>
      </div>

      {/* 顶部路径状态短句 — 按阶段切换, Camp 5/6 阶段附加真重规划次数 */}
      <div className="px-5 pt-4">
        <PathStatusBanner stage={stage} revisions={revisions} revisionCount={revisionCount} />
      </div>

      {/* 1. 本阶段目标 */}
      <div className="px-5 pt-4">
        <FlatBlock title="本阶段目标" items={[stage.objective]} accent={statusColor} />
      </div>

      {/* 2. 今日任务 */}
      <div className="px-5 pt-4">
        <FlatBlock title="今日任务" items={stage.tasks.slice(0, 3)} accent={statusColor} />
      </div>

      {/* 3. 本阶段推荐资源 (chip 横排) */}
      <div className="px-5 pt-4 pb-4">
        <CampSupplies
          packages={packages}
          sessionId={sessionId}
          stageTitle={stage.title}
        />
      </div>

      {/* 4. 通过后 */}
      <div className="border-t border-[var(--border)] bg-[var(--muted)] px-5 py-3 text-[12.5px] leading-5 text-[var(--muted-foreground)]">
        <span className="font-medium text-[var(--foreground)]">通过后 · </span>
        {stage.transitionNext}
      </div>
    </section>
  );
}

// ===== 顶部路径状态短句 — 按阶段切换文案; Camp 5/6 附加真重规划计数 =====
function PathStatusBanner({
  stage,
  revisions,
  revisionCount,
}: {
  stage: PathStage;
  revisions: PathRevisionRecord[];
  revisionCount: number;
}) {
  const showRevisionStrip =
    (stage.id === "feedback" || stage.id === "review") && revisionCount > 0;
  const latest = revisions[0];
  const latestWhen = latest ? formatRevisionTime(latest.timestamp) : "";
  return (
    <div className="space-y-1.5 rounded-2xl border border-violet-200/70 bg-violet-50/50 px-4 py-3">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-violet-500/15 text-violet-600">
          <RefreshCw size={11} />
        </span>
        <p className="text-[13px] leading-6 text-violet-900">{stage.statusMessage}</p>
      </div>
      {showRevisionStrip ? (
        <div className="ml-7 flex flex-wrap items-center gap-1 text-[11px] leading-5 text-violet-700">
          <span className="rounded-full bg-violet-500/15 px-2 py-0.5 font-medium">
            已重规划 {revisionCount} 次
          </span>
          {latest ? (
            <span className="text-violet-700/85">
              · 最近 {latestWhen} · {truncateText(latest.reason, 30)}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function formatRevisionTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "刚刚";
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  return `${Math.floor(h / 24)} 天前`;
}

function truncateText(s: string, n: number): string {
  if (!s) return "";
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}

// ===== 本营地补给 (6 类资源 chip) =====
function CampSupplies({
  packages,
  sessionId,
  stageTitle,
}: {
  packages: LearningResourcePackage[];
  sessionId: string;
  stageTitle: string;
}) {
  const router = useRouter();
  // 聚合所有 package 的 asset.type 集合
  const generatedTypes = useMemo(() => {
    const s = new Set<string>();
    for (const p of packages) {
      for (const a of p.assets || []) {
        s.add(a.type);
      }
    }
    return s;
  }, [packages]);
  const latestPkg = packages[0];
  const readyCount = RESOURCE_KINDS.filter((k) =>
    k.matchTypes.some((t) => generatedTypes.has(t)),
  ).length;

  const triggerGen = (kindLabel: string, prompt: string) => {
    // 跳 /chat 自动发预置 prompt (依靠 URL ?p= 参数, 由 ChatPanel 消费)
    const url = sessionId
      ? `/chat?session=${sessionId}&p=${encodeURIComponent(prompt)}`
      : `/chat?p=${encodeURIComponent(prompt)}`;
    router.push(url);
  };

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--muted)]/40 px-4 py-3">
      <header className="mb-1.5 flex flex-wrap items-end justify-between gap-1">
        <div className="flex items-center gap-2">
          <Package size={13} className="text-[var(--primary)]" />
          <p className="text-[12.5px] font-semibold text-[var(--foreground)]">
            本阶段推荐资源 {readyCount}/{RESOURCE_KINDS.length} {readyCount === 0 ? "待生成" : "已生成"}
          </p>
        </div>
      </header>
      <p className="mb-2.5 text-[11px] leading-5 text-[var(--muted-foreground)]">
        {readyCount === 0
          ? `完成${stageTitle}后, 系统将自动生成匹配资源 (课程文档、思维导图、章节习题、代码案例、知识卡片、可视化图表)。`
          : "资源包括: 课程文档、思维导图、章节习题、代码案例、知识卡片、可视化图表。"}
      </p>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-6">
        {RESOURCE_KINDS.map((k) => {
          const ready = k.matchTypes.some((t) => generatedTypes.has(t));
          const Icon = k.icon;
          const onClick = ready
            ? () => router.push(latestPkg ? `/resources?pkg=${latestPkg.id}` : "/resources")
            : () => triggerGen(k.label, `请围绕「${stageTitle}」给我生成${k.label}`);
          return (
            <button
              key={k.key}
              type="button"
              onClick={onClick}
              title={ready ? `查看 ${k.label}` : `一键发起生成 ${k.label}`}
              className={`group relative flex items-center gap-1.5 rounded-xl border px-2 py-1.5 text-left transition active:scale-[0.98] ${
                ready
                  ? "border-transparent text-white"
                  : "border-dashed border-[var(--border)] bg-[var(--card-solid)] text-[var(--muted-foreground)] hover:border-[var(--primary)] hover:text-[var(--foreground)]"
              }`}
              style={ready ? { background: k.color } : undefined}
            >
              <Icon size={13} />
              <span className="text-[11px] font-medium">{k.label}</span>
              <span
                className={`ml-auto inline-flex h-3.5 w-3.5 items-center justify-center rounded-full ${
                  ready ? "bg-white/30" : "bg-[var(--muted)]"
                }`}
              >
                {ready ? (
                  <CheckCircle2 size={9} strokeWidth={3} />
                ) : (
                  <Plus size={9} strokeWidth={3} />
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ===== 6 类资源映射 (赛题口径 5+1) =====
const RESOURCE_KINDS: Array<{
  key: string;
  label: string;
  icon: LucideIcon;
  color: string;
  matchTypes: string[];
}> = [
  { key: "lecture", label: "课程文档", icon: FileText, color: "#007AFF", matchTypes: ["audio", "micro_lecture"] },
  { key: "mindmap", label: "思维导图", icon: Network, color: "#a78bfa", matchTypes: ["mindmap"] },
  { key: "quiz", label: "章节习题", icon: HelpCircle, color: "#f59e0b", matchTypes: ["quiz", "exam"] },
  { key: "code", label: "代码案例", icon: Code2, color: "#10b981", matchTypes: ["code_lab"] },
  { key: "reading", label: "知识卡片", icon: BookOpen, color: "#22d3ee", matchTypes: ["flashcards"] },
  { key: "media", label: "可视化图表", icon: PlayCircle, color: "#f43f5e", matchTypes: ["mermaid"] },
];

function FlatBlock({
  title,
  items,
  accent,
}: {
  title: string;
  items: string[];
  accent: string;
}) {
  return (
    <div>
      <h3 className="mb-1.5 font-mono text-[10.5px] uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
        {title}
      </h3>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li
            key={`${item}-${i}`}
            className="flex gap-2 text-[12.5px] leading-5 text-[var(--foreground)]"
          >
            <span
              className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: accent }}
            />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ===== 数据 — 赛题口径 6 阶段, 严格按"动态调整 + 精准推送" 闭环排序 =====
//   目标诊断 → 薄弱点定位 → 基础补齐 → 资源包生成 → 练习反馈 → 路径重规划
// 状态机: 任何时刻至多 1 个 active. 顶部进度环 / 营地浮卡 / 地图金旗 三处一致.
function buildPathStages(
  profile: LearningProfile | null,
  packages: LearningResourcePackage[],
): PathStage[] {
  const hasGoal = Boolean(profile?.learning_goal);
  const hasWeak = Boolean(profile?.weak_points?.length);
  const hasResource = packages.length > 0;
  const hasFeedback = typeof profile?.quiz_accuracy === "number";

  const weakText = profile?.weak_points?.slice(0, 3).join("、") || "待定位的薄弱点";
  const topicText = profile?.topics?.slice(0, 3).join("、") || packages[0]?.topic || "当前主题";
  const latestPackage = packages[0];

  // 6 个 stage 的 done 条件
  const flags = [hasGoal, hasWeak, hasResource, hasResource, hasFeedback];
  // (注: 最后一项 review 在状态机里特判 — 前 5 全 done → active, 否则 pending)

  const blueprints: Array<Omit<PathStage, "status">> = [
    {
      id: "diagnosis",
      title: "目标诊断",
      objective: "明确学习目标、当前水平、约束条件和学习偏好。",
      basis: hasGoal ? profile?.learning_goal || "已形成学习目标" : "尚未收集到明确学习目标。",
      tasks: ["描述学习目标和基础水平", "识别关注主题与偏好", "形成学习者画像快照"],
      outputs: ["学习目标", "当前水平", "画像维度覆盖"],
      acceptance: "画像中至少包含目标、水平、关注主题三个维度。",
      icon: Target,
      transitionNext: "进入 Camp 2: 薄弱点定位。系统会根据画像信息识别薄弱知识点。",
      statusMessage: "本阶段正在建立画像 · 完成目标诊断后, 系统将根据画像生成后续学习路线。",
    },
    {
      id: "weakness",
      title: "薄弱点定位",
      objective: `围绕 ${topicText} 定位你的薄弱概念与错因模式。`,
      basis: hasWeak ? `已抓到薄弱点: ${weakText}` : "等待画像/诊断题信号定位薄弱区。",
      tasks: ["聊出 1-3 个具体薄弱点", "或答一组诊断题让 BKT 估计掌握度", "更新画像 weak_points"],
      outputs: ["薄弱点清单", "BKT 掌握度估计", "画像证据链"],
      acceptance: "画像 weak_points 含 ≥1 项, 或 BKT 至少标记一个 KC 为 low.",
      icon: Search,
      transitionNext: "进入 Camp 3: 基础补齐。系统会按薄弱点逆推前置知识链。",
      statusMessage: "本阶段正在扫描薄弱点 · 完成后, 系统将逆推前置知识链。",
      routeChange: { original: "基础课按顺序铺开", updated: "先定位薄弱再补" },
    },
    {
      id: "foundation",
      title: "基础补齐",
      objective: `针对 ${weakText} 补齐前置基础与核心概念框架。`,
      basis: hasWeak ? `按薄弱点 ${weakText} 反推前置知识。` : "默认按 KG 主线建立核心概念框架。",
      tasks: ["阅读 AI 选的微讲义", "梳理思维导图", "完成基础题验证"],
      outputs: ["微讲义", "知识结构节点", "BKT 掌握度提升"],
      acceptance: "薄弱点关联 KC 的 BKT 掌握度上升, 或学生能复述核心概念。",
      icon: BookOpen,
      transitionNext: "进入 Camp 4: 资源包生成。多智能体会协同打包可下载资源。",
      statusMessage: "本阶段正在补齐基础 · 完成后, 系统将派发多智能体生成资源。",
      routeChange: { original: "直接进入资源生成", updated: "先补基础概念" },
    },
    {
      id: "resource",
      title: "资源包生成",
      objective: "多智能体协同生成 5+ 类个性化资源 (讲义/导图/题/代码/动画/拓展)。",
      basis: latestPackage ? `最近资源包: ${latestPackage.title}` : "尚未生成资源包。",
      tasks: ["QuizGen 出题目", "MindMapGen 出层级结构", "CodeLab 出可跑代码"],
      outputs: latestPackage
        ? latestPackage.assets.slice(0, 3).map((a) => a.label)
        : ["试卷", "思维导图", "代码案例"],
      acceptance: "资源包含 ≥5 类资源, 且与画像薄弱点相关。",
      icon: Package,
      transitionNext: "进入 Camp 5: 练习反馈。系统会根据答题结果调整后续路径。",
      statusMessage: "多智能体正在并行生成资源 · 完成后, 等待你提交诊断题。",
      routeChange: { original: "固定模板输出", updated: "围绕薄弱点定制" },
    },
    {
      id: "feedback",
      title: "练习反馈",
      objective: "根据答题结果更新 BKT/DKT 掌握度与画像薄弱点。",
      basis: hasFeedback
        ? `最近正确率 ${Math.round((profile?.quiz_accuracy || 0) * 100)}%`
        : "等待学生提交诊断题答案。",
      tasks: ["提交答案触发 BKT/DKT 更新", "错题入 FSRS 错题箱", "薄弱点动态收窄"],
      outputs: ["正确率", "错题主题", "BKT 后验掌握度"],
      acceptance: "系统能根据错题主题更新画像 weak_points, 且 BKT 出现明显后验调整。",
      icon: CheckCircle2,
      transitionNext: "进入 Camp 6: 阶段复盘。整理本轮收获并启动下一轮。",
      statusMessage: "根据练习反馈, 系统已触发路径重规划。",
      routeChange: { original: "按预设路径推进", updated: "答题反馈驱动调整" },
    },
    {
      id: "review",
      title: "阶段复盘",
      objective: "回顾本轮学习收获、错题主题与掌握度变化, 决定下一轮目标。",
      basis: "整合画像、资源包、答题反馈, 给本轮一个交付物。",
      tasks: ["回看本轮新增画像证据", "复习错题与思维导图", "确认是否进入下一轮目标"],
      outputs: ["本轮收获清单", "下一轮学习目标候选", "系统路径重规划记录"],
      acceptance: "学生能复述本轮收获 + 系统已基于新画像生成下一轮路径草案。",
      icon: CheckCircle2,
      transitionNext: "这是闭环 — 回到 Camp 1: 目标诊断, 即可看到更新后的画像与新路线。",
      statusMessage: "根据本轮复盘, 系统已触发路径重规划。",
      routeChange: { original: "学习闭环结束", updated: "复盘后启动重规划" },
    },
  ];

  // 状态机: 第一个未达成 flag 的设 active, 之前全 done, 之后全 pending.
  // replan (最后一个) 仅在前 5 个全 done 时才 active.
  const stages: PathStage[] = [];
  let activeAssigned = false;
  for (let i = 0; i < blueprints.length; i++) {
    let status: PathStage["status"];
    if (i === blueprints.length - 1) {
      const prevAllDone = flags.every(Boolean);
      status = prevAllDone ? "active" : "pending";
    } else if (flags[i]) {
      status = "done";
    } else if (!activeAssigned) {
      status = "active";
      activeAssigned = true;
    } else {
      status = "pending";
    }
    stages.push({ ...blueprints[i], status });
  }
  return stages;
}
