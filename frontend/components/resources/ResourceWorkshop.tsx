"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Code2,
  FileText,
  HelpCircle,
  Loader2,
  Network,
  Package,
  PlayCircle,
  Plus,
  RefreshCw,
  Sparkles,
  Target,
  Wand2,
  type LucideIcon,
} from "lucide-react";
import {
  getResourceAvgDuration,
  listResourcePackages,
  type LearningResourcePackage,
  type ResourceAvgDuration,
} from "@/lib/api";
import { CodeLabCard } from "@/components/code_lab/CodeLabCard";
import { MermaidDiagramCard } from "@/components/mermaid/MermaidDiagramCard";
import { ResourceMindMap } from "./ResourceMindMap";

/**
 * AI 资源生成工坊 · 星图视觉
 *
 * 三栏: 280 / 1fr / 340.
 * 中部主视觉 = 资源生成星图 (中心 Camp + 包名 + 画像匹配, 围绕 6 资源卫星)。
 * 已生成卫星实色 + 连线渐变实线; 未生成卫星浅灰 + 连线虚线。
 */
export function ResourceWorkshop() {
  const router = useRouter();
  const [packages, setPackages] = useState<LearningResourcePackage[]>([]);
  const [selectedPkgId, setSelectedPkgId] = useState("");
  const [selectedKind, setSelectedKind] = useState<ResourceKindKey | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    listResourcePackages()
      .then((data) => {
        if (cancelled) return;
        setPackages(data);
        setSelectedPkgId(data[0]?.id || "");
      })
      .catch(() => {
        if (!cancelled) setError("资源包加载失败, 请稍后重试");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = useMemo(
    () => packages.find((item) => item.id === selectedPkgId) || packages[0],
    [packages, selectedPkgId],
  );

  // 默认选中第一个 ready 资源 (mindmap 兜底), 保证右栏不空
  useEffect(() => {
    if (!selected) return;
    const types = new Set<string>();
    for (const a of selected.assets || []) types.add(a.type);
    const firstReady = RESOURCE_KINDS.find((k) =>
      k.matchTypes.some((t) => types.has(t)),
    );
    setSelectedKind(firstReady?.key ?? "mindmap");
  }, [selected]);

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--surface)] backdrop-blur-2xl">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between gap-3 px-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/chat"
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-[12px] text-[var(--foreground)] hover:bg-[var(--muted)]"
            >
              <ArrowLeft size={13} />
              返回工作台
            </Link>
            <div className="hidden h-4 w-px bg-[var(--border)] sm:block" />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-[14.5px] font-semibold">
                <Wand2 size={14} className="text-[var(--primary)]" />
                AI 资源生成工坊
              </div>
              <p className="text-[11px] text-[var(--muted-foreground)]">
                资源生成星图 · 跟随学习路径与画像编排
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1400px] gap-4 px-4 pt-5 pb-12 lg:grid-cols-[280px_minmax(0,1fr)_340px]">
        <PackageList
          packages={packages}
          loading={loading}
          error={error}
          selectedId={selected?.id || ""}
          onSelect={(id) => setSelectedPkgId(id)}
          onGenerate={() =>
            router.push(
              "/chat?p=" +
                encodeURIComponent(
                  "根据当前学习路径阶段, 帮我生成完整资源包 (覆盖讲义、思维导图、习题、代码、阅读、动画 6 类)",
                ),
            )
          }
        />

        <section className="min-w-0 space-y-3.5">
          {loading && !selected ? (
            <div className="flex h-64 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--card)]">
              <Loader2 size={20} className="animate-spin text-[var(--muted-foreground)]" />
            </div>
          ) : !selected ? (
            <EmptyWorkshop />
          ) : (
            <>
              <PipelineMini pkg={selected} />
              <TagStrip pkg={selected} />
              <ResourceStarMap
                pkg={selected}
                activeKind={selectedKind}
                onPick={(k) => setSelectedKind(k)}
              />
              <RationaleStrip pkg={selected} />
            </>
          )}
        </section>

        <aside className="min-w-0">
          <PreviewPanel
            pkg={selected ?? null}
            kind={selectedKind}
            onOpenChat={(prompt) =>
              router.push("/chat?p=" + encodeURIComponent(prompt))
            }
          />
        </aside>
      </div>
    </main>
  );
}

// ============== 左栏 · 资源包列表 ==============

function PackageList({
  packages,
  loading,
  error,
  selectedId,
  onSelect,
  onGenerate,
}: {
  packages: LearningResourcePackage[];
  loading: boolean;
  error: string;
  selectedId: string;
  onSelect: (id: string) => void;
  onGenerate: () => void;
}) {
  return (
    <aside className="min-w-0 space-y-3">
      <button
        type="button"
        onClick={onGenerate}
        className="group flex w-full items-center gap-2 rounded-2xl bg-gradient-to-r from-[#007AFF] to-[#7c3aed] px-3 py-2.5 text-left text-[12.5px] font-medium text-white shadow-sm transition hover:opacity-92"
      >
        <Sparkles size={14} />
        <span className="flex-1">从当前路径生成资源包</span>
        <ChevronRight size={13} className="opacity-90" />
      </button>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-[12px] text-red-700">
          {error}
        </div>
      ) : null}

      {loading && packages.length === 0 ? (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3 text-[12px] text-[var(--muted-foreground)]">
          正在加载...
        </div>
      ) : null}

      {!loading && !error && packages.length === 0 ? (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 text-[12px] leading-5 text-[var(--muted-foreground)]">
          还没有资源包。点击上方按钮, 让 AI 按当前学习路径阶段生成。
        </div>
      ) : null}

      <div className="space-y-1.5">
        {packages.map((p) => {
          const isActive = p.id === selectedId;
          const totalKinds = RESOURCE_KINDS.length;
          const readyKinds = countReadyKinds(p);
          const stageInfo = inferStage(p);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelect(p.id)}
              className={`relative w-full rounded-2xl border px-3 py-2.5 text-left transition ${
                isActive
                  ? "border-[var(--primary)]/40 bg-[var(--card)] shadow-sm"
                  : "border-[var(--border)] bg-[var(--card)]/60 hover:bg-[var(--card)]"
              }`}
            >
              {isActive ? (
                <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-gradient-to-b from-[#007AFF] to-[#7c3aed]" />
              ) : null}
              <p className="line-clamp-2 text-[13px] font-semibold leading-snug">
                {p.title}
              </p>
              <p className="mt-1 text-[10.5px] text-[var(--muted-foreground)]">
                {stageInfo.label}
              </p>
              <div className="mt-1.5 flex items-center gap-2">
                <div className="h-[5px] flex-1 overflow-hidden rounded-full bg-[var(--muted)]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#007AFF] to-[#7c3aed]"
                    style={{ width: `${(readyKinds / totalKinds) * 100}%` }}
                  />
                </div>
                <span className="font-mono text-[10px] text-[var(--muted-foreground)]">
                  {readyKinds}/{totalKinds}
                </span>
              </div>
              <p className="mt-1 text-[10px] text-[var(--muted-foreground)]/85">
                {formatRelative(p.updated_at || p.created_at)}
              </p>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

// ============== 中 · 流水线 (迷你单行) ==============

const PIPELINE_STEPS = [
  "课程资料解析",
  "知识点抽取",
  "画像匹配",
  "多智能体生成",
  "内容审核",
  "资源入包",
];

function PipelineMini({ pkg }: { pkg: LearningResourcePackage }) {
  // 真接 pkg.pipeline_steps; 回退 (老数据) 用启发式
  const steps = pkg.pipeline_steps?.length
    ? pkg.pipeline_steps.map((s) => ({ label: s.label, done: s.status === "done", note: s.note }))
    : PIPELINE_STEPS.map((label, i) => {
        const readyKinds = countReadyKinds(pkg);
        let progress = 0;
        if (readyKinds === 0) progress = 3;
        else if (readyKinds < RESOURCE_KINDS.length) progress = 5;
        else progress = PIPELINE_STEPS.length;
        return { label, done: i < progress, note: "" };
      });

  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 rounded-2xl border border-[var(--border)] bg-[var(--card)]/60 px-3 py-1.5 text-[10.5px]">
      {steps.map((step, i) => {
        const isReview = step.label === "内容审核";
        return (
          <span
            key={step.label}
            className="inline-flex items-center gap-1"
            title={step.note || undefined}
          >
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${
                step.done ? "bg-[var(--primary)]" : "bg-[var(--muted-foreground)]/35"
              }`}
            />
            <span
              className={`${
                step.done
                  ? "font-medium text-[var(--foreground)]"
                  : "text-[var(--muted-foreground)]"
              } ${isReview ? "text-emerald-600 font-semibold" : ""}`}
            >
              {step.label}
              {isReview ? (
                <span className="ml-0.5 text-[9.5px] text-emerald-600/85">·防幻觉</span>
              ) : null}
            </span>
            {i < steps.length - 1 ? (
              <ChevronRight size={10} className="text-[var(--muted-foreground)]/60" />
            ) : null}
          </span>
        );
      })}
    </div>
  );
}

// ============== 中 · 标签条 (3 chip) ==============

function TagStrip({ pkg }: { pkg: LearningResourcePackage }) {
  const stageInfo = inferStage(pkg);
  const sources = pkg.knowledge_evidence?.sources ?? [];
  const readyKinds = countReadyKinds(pkg);

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
      <TagChip icon={Target} label="来自路径" value={stageInfo.label} />
      <TagChip
        icon={BookOpen}
        label="知识来源"
        value={sources.length ? `课程知识库 ${sources.length} 篇` : "课程知识库"}
        tooltip={sources.map((s) => s.title).join("\n")}
      />
      <TagChip
        icon={Package}
        label="生成进度"
        value={`${readyKinds}/${RESOURCE_KINDS.length}`}
      />
    </div>
  );
}

function TagChip({
  icon: Icon,
  label,
  value,
  tooltip,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  tooltip?: string;
}) {
  return (
    <span
      title={tooltip || undefined}
      className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--card)] px-2.5 py-1 text-[11px]"
    >
      <Icon size={11} className="text-[var(--primary)]" />
      <span className="text-[var(--muted-foreground)]">{label}</span>
      <span className="font-medium text-[var(--foreground)]">{value}</span>
    </span>
  );
}

// ============== 中 · 资源生成星图 (主视觉) ==============

type ResourceKindKey =
  | "lecture"
  | "mindmap"
  | "quiz"
  | "code"
  | "reading"
  | "media";

interface ResourceKind {
  key: ResourceKindKey;
  label: string;
  altLabel: string;
  icon: LucideIcon;
  hex: string;            // 主色 hex (用于 SVG 渐变 stop)
  hex2: string;           // 副色 (渐变第二 stop)
  matchTypes: string[];
}

const RESOURCE_KINDS: ResourceKind[] = [
  { key: "lecture", label: "课程文档", altLabel: "微讲义", icon: FileText, hex: "#007AFF", hex2: "#0a84ff", matchTypes: ["audio", "micro_lecture"] },
  { key: "mindmap", label: "思维导图", altLabel: "", icon: Network, hex: "#7c3aed", hex2: "#a78bfa", matchTypes: ["mindmap"] },
  { key: "quiz", label: "章节习题", altLabel: "诊断题", icon: HelpCircle, hex: "#f59e0b", hex2: "#fbbf24", matchTypes: ["quiz", "exam"] },
  { key: "code", label: "代码案例", altLabel: "", icon: Code2, hex: "#10b981", hex2: "#34d399", matchTypes: ["code_lab"] },
  { key: "reading", label: "知识卡片", altLabel: "闪卡复习", icon: BookOpen, hex: "#06b6d4", hex2: "#22d3ee", matchTypes: ["flashcards"] },
  { key: "media", label: "可视化图表", altLabel: "结构图示", icon: PlayCircle, hex: "#f43f5e", hex2: "#fb7185", matchTypes: ["mermaid"] },
];

// 星图 viewBox 与节点几何 (常量)
const SM_W = 760;
const SM_H = 540;
const SM_CX = 380;
const SM_CY = 270;
const SM_CENTER_R = 92;
const SM_SAT_R = 40;
const SM_ORBIT_A = 290;
const SM_ORBIT_B = 195;
// 6 个卫星角度: 顶 / 右上 / 右下 / 底 / 左下 / 左上
const SM_ANGLES = [-Math.PI / 2, -Math.PI / 6, Math.PI / 6, Math.PI / 2, (5 * Math.PI) / 6, (-5 * Math.PI) / 6];

function ResourceStarMap({
  pkg,
  activeKind,
  onPick,
}: {
  pkg: LearningResourcePackage;
  activeKind: ResourceKindKey | null;
  onPick: (k: ResourceKindKey) => void;
}) {
  const generatedTypes = new Set<string>();
  for (const a of pkg.assets || []) generatedTypes.add(a.type);
  const profile = pkg.learner_snapshot;
  const stageInfo = inferStage(pkg);

  const satellites = RESOURCE_KINDS.map((k, i) => {
    const angle = SM_ANGLES[i];
    const x = SM_CX + SM_ORBIT_A * Math.cos(angle);
    const y = SM_CY + SM_ORBIT_B * Math.sin(angle);
    const ready = k.matchTypes.some((t) => generatedTypes.has(t));
    return { kind: k, x, y, ready, angle };
  });

  // 中心节点下方信息 — 真接 weak_points_targeted (回退到 snapshot)
  const targetedList = pkg.weak_points_targeted?.length
    ? pkg.weak_points_targeted
    : profile?.weak_points || [];
  const weakBrief = targetedList.slice(0, 3).join("、") || "尚未识别";
  const goalCount = profile?.learning_goal ? 1 : 0;
  const profileBrief =
    [profile?.level, profile?.learning_goal]
      .filter(Boolean)
      .slice(0, 2)
      .join(" · ") || "等待画像建立";

  return (
    <section
      className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]"
      style={{
        backgroundImage:
          "radial-gradient(ellipse at 50% 45%, rgba(167,139,250,0.20) 0%, transparent 70%)",
      }}
    >
      <div className="relative w-full" style={{ aspectRatio: `${SM_W} / ${SM_H}` }}>
        <svg
          viewBox={`0 0 ${SM_W} ${SM_H}`}
          className="absolute inset-0 h-full w-full"
        >
          <defs>
            {/* 中心节点 紫色发光 */}
            <radialGradient id="lf-center-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(167,139,250,0.55)" />
              <stop offset="100%" stopColor="rgba(167,139,250,0)" />
            </radialGradient>
            <linearGradient id="lf-center-border" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#007AFF" />
              <stop offset="100%" stopColor="#7c3aed" />
            </linearGradient>
            {/* 6 类资源颜色渐变 */}
            {RESOURCE_KINDS.map((k) => (
              <linearGradient
                key={`grad-${k.key}`}
                id={`lf-sat-${k.key}`}
                x1="0%"
                y1="0%"
                x2="100%"
                y2="100%"
              >
                <stop offset="0%" stopColor={k.hex} />
                <stop offset="100%" stopColor={k.hex2} />
              </linearGradient>
            ))}
            {/* 连线渐变 (中心紫 → 卫星色) */}
            {RESOURCE_KINDS.map((k) => (
              <linearGradient
                key={`line-${k.key}`}
                id={`lf-line-${k.key}`}
                x1="0%"
                y1="0%"
                x2="100%"
                y2="0%"
              >
                <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.6" />
                <stop offset="100%" stopColor={k.hex} stopOpacity="0.85" />
              </linearGradient>
            ))}
          </defs>

          {/* 极淡星点装饰 */}
          {Array.from({ length: 22 }).map((_, i) => {
            const x = ((i * 53) % SM_W);
            const y = ((i * 79) % SM_H);
            return (
              <circle
                key={i}
                cx={x}
                cy={y}
                r="1"
                fill="rgba(124,58,237,0.18)"
              />
            );
          })}

          {/* 轨道椭圆 */}
          <ellipse
            cx={SM_CX}
            cy={SM_CY}
            rx={SM_ORBIT_A}
            ry={SM_ORBIT_B}
            fill="none"
            stroke="rgba(124,58,237,0.15)"
            strokeWidth="1"
            strokeDasharray="2 6"
          />

          {/* 中心光晕 */}
          <circle cx={SM_CX} cy={SM_CY} r="140" fill="url(#lf-center-glow)" />

          {/* 连线 (在节点下) */}
          {satellites.map(({ kind, x, y, ready }) => {
            // 计算线段端点 (从 center 边缘 → satellite 边缘)
            const dx = x - SM_CX;
            const dy = y - SM_CY;
            const dist = Math.hypot(dx, dy) || 1;
            const ux = dx / dist;
            const uy = dy / dist;
            const x1 = SM_CX + ux * SM_CENTER_R;
            const y1 = SM_CY + uy * SM_CENTER_R;
            const x2 = x - ux * SM_SAT_R;
            const y2 = y - uy * SM_SAT_R;
            return (
              <line
                key={`line-${kind.key}`}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={ready ? `url(#lf-line-${kind.key})` : "rgba(148,163,184,0.45)"}
                strokeWidth={ready ? 1.8 : 1.2}
                strokeDasharray={ready ? undefined : "4 5"}
                strokeLinecap="round"
              />
            );
          })}

          {/* 中心节点 圆 (主题感知底色) */}
          <circle
            cx={SM_CX}
            cy={SM_CY}
            r={SM_CENTER_R}
            fill="var(--card-solid)"
            stroke="url(#lf-center-border)"
            strokeWidth="2"
          />
          <circle
            cx={SM_CX}
            cy={SM_CY}
            r={SM_CENTER_R + 6}
            fill="none"
            stroke="rgba(124,58,237,0.18)"
            strokeWidth="1"
          />

          {/* 卫星节点 圆 */}
          {satellites.map(({ kind, x, y, ready }) => {
            const isActive = activeKind === kind.key;
            return (
              <g key={`sat-${kind.key}`}>
                {/* active 外环 */}
                {isActive ? (
                  <circle
                    cx={x}
                    cy={y}
                    r={SM_SAT_R + 6}
                    fill="none"
                    stroke={ready ? kind.hex : "#7c3aed"}
                    strokeWidth="2"
                    strokeOpacity="0.45"
                  />
                ) : null}
                {/* ready 时柔和光晕 */}
                {ready ? (
                  <circle
                    cx={x}
                    cy={y}
                    r={SM_SAT_R + 12}
                    fill={kind.hex}
                    fillOpacity="0.10"
                  />
                ) : null}
                <circle
                  cx={x}
                  cy={y}
                  r={SM_SAT_R}
                  fill={ready ? `url(#lf-sat-${kind.key})` : "var(--card-solid)"}
                  stroke={ready ? "white" : "rgba(148,163,184,0.55)"}
                  strokeWidth={ready ? 2 : 1.2}
                  strokeDasharray={ready ? undefined : "4 4"}
                />
              </g>
            );
          })}
        </svg>

        {/* HTML 覆盖层: 中心文字 + 卫星图标 + 卫星标签 */}
        {/* 中心节点文字 */}
        <div
          className="pointer-events-none absolute flex w-[200px] -translate-x-1/2 -translate-y-1/2 flex-col items-center text-center"
          style={{ left: `${(SM_CX / SM_W) * 100}%`, top: `${(SM_CY / SM_H) * 100}%` }}
        >
          <p className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-violet-600">
            {stageInfo.label}
          </p>
          <p
            className="mt-1 line-clamp-2 text-[13.5px] font-bold leading-tight text-[var(--foreground)]"
            title={pkg.title}
          >
            {truncate(pkg.title, 14)}
          </p>
          <p className="mt-1 text-[10px] leading-4 text-[var(--muted-foreground)]">
            {profileBrief}
          </p>
        </div>

        {/* 中心节点下方画像简介 */}
        <div
          className="pointer-events-none absolute -translate-x-1/2 text-center"
          style={{
            left: `${(SM_CX / SM_W) * 100}%`,
            top: `${((SM_CY + SM_CENTER_R + 14) / SM_H) * 100}%`,
          }}
        >
          <p className="text-[10.5px] leading-4 text-[var(--muted-foreground)]">
            <span className="text-[var(--muted-foreground)]">画像匹配 · </span>
            <span className="font-medium text-[var(--foreground)]">
              {targetedList.length} 个薄弱点 · {goalCount} 个目标
            </span>
          </p>
          <p className="mt-0.5 max-w-[260px] text-[10.5px] leading-4 text-[var(--muted-foreground)]">
            <span className="text-[var(--muted-foreground)]">薄弱点 · </span>
            <span className="font-medium text-[var(--foreground)]">{truncate(weakBrief, 22)}</span>
          </p>
        </div>

        {/* 卫星节点: 图标 + 标签 */}
        {satellites.map(({ kind, x, y, ready }) => {
          const Icon = kind.icon;
          const isActive = activeKind === kind.key;
          const labelTopPct = ((y + SM_SAT_R + 8) / SM_H) * 100;
          return (
            <div key={kind.key}>
              <button
                type="button"
                onClick={() => onPick(kind.key)}
                className="absolute flex h-[60px] w-[60px] -translate-x-1/2 -translate-y-1/2 items-center justify-center transition active:scale-95"
                style={{
                  left: `${(x / SM_W) * 100}%`,
                  top: `${(y / SM_H) * 100}%`,
                }}
                title={`${kind.label}${kind.altLabel ? " / " + kind.altLabel : ""}`}
              >
                <Icon
                  size={18}
                  className={
                    ready
                      ? "text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]"
                      : "text-[var(--muted-foreground)]"
                  }
                />
              </button>
              <div
                className="pointer-events-none absolute -translate-x-1/2 text-center"
                style={{
                  left: `${(x / SM_W) * 100}%`,
                  top: `${labelTopPct}%`,
                  width: 120,
                }}
              >
                <p
                  className={`text-[10.5px] font-semibold leading-tight ${
                    isActive
                      ? "text-violet-700"
                      : ready
                        ? "text-[var(--foreground)]"
                        : "text-[var(--muted-foreground)]"
                  }`}
                >
                  {kind.label}
                  {kind.altLabel ? (
                    <span className="ml-0.5 text-[9.5px] font-normal opacity-75">
                      / {kind.altLabel}
                    </span>
                  ) : null}
                </p>
                <p
                  className={`mt-0.5 inline-flex items-center gap-0.5 text-[9.5px] ${
                    ready ? "text-emerald-600" : "text-[var(--muted-foreground)]"
                  }`}
                >
                  {ready ? (
                    <>
                      <CheckCircle2 size={9} strokeWidth={3} />
                      已生成
                    </>
                  ) : (
                    <>
                      <Plus size={9} strokeWidth={3} />
                      待生成
                    </>
                  )}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ============== 中 · 生成依据 (3 行) ==============

function RationaleStrip({ pkg }: { pkg: LearningResourcePackage }) {
  const stageInfo = inferStage(pkg);
  const weak = pkg.learner_snapshot?.weak_points?.slice(0, 3) || [];
  const weakText = weak.length ? weak.join("、") : "通用基础概念";
  const sourceCount = pkg.knowledge_evidence?.sources?.length ?? 0;
  const sourceTitle = pkg.knowledge_evidence?.sources?.[0]?.title || "课程知识库";

  return (
    <section className="rounded-2xl border border-violet-200/70 bg-violet-50/50 px-4 py-3">
      <header className="mb-1.5 flex items-center gap-2">
        <Sparkles size={12} className="text-violet-600" />
        <p className="text-[12px] font-semibold text-violet-900">生成依据</p>
      </header>
      <ul className="space-y-1 text-[12px] leading-5 text-violet-900">
        <li>· 依据 {stageInfo.label} 生成</li>
        <li>· 匹配薄弱点: {weakText}</li>
        <li>
          · 知识来源:{" "}
          {sourceCount > 0
            ? `${truncate(sourceTitle, 18)} 等 ${sourceCount} 篇章节`
            : "学习画像与目标 (尚未召回课程章节)"}
        </li>
      </ul>
    </section>
  );
}

// ============== 右 · 资源预览舱 ==============

function PreviewPanel({
  pkg,
  kind,
  onOpenChat,
}: {
  pkg: LearningResourcePackage | null;
  kind: ResourceKindKey | null;
  onOpenChat: (prompt: string) => void;
}) {
  // 真测学习时长 (xAPI 聚合); kind/pkg 变化时拉
  const [avgDur, setAvgDur] = useState<ResourceAvgDuration | null>(null);
  useEffect(() => {
    if (!pkg || !kind) {
      setAvgDur(null);
      return;
    }
    let cancelled = false;
    const objectId = resourceObjectId(pkg, kind);
    if (!objectId) {
      setAvgDur(null);
      return;
    }
    getResourceAvgDuration(objectId)
      .then((d) => {
        if (!cancelled) setAvgDur(d);
      })
      .catch(() => {
        if (!cancelled) setAvgDur(null);
      });
    return () => {
      cancelled = true;
    };
  }, [pkg, kind]);

  if (!pkg || !kind) {
    return (
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 text-center">
        <Package size={20} className="mx-auto mb-2 text-[var(--muted-foreground)]" />
        <p className="text-[12px] text-[var(--muted-foreground)]">
          等待资源包就绪
        </p>
      </div>
    );
  }

  const meta = RESOURCE_KINDS.find((k) => k.key === kind)!;
  const stageInfo = inferStage(pkg);
  const sourcePoints = (pkg.resources.mindmap?.nodes || [])
    .slice(0, 3)
    .map((n) => n.label);
  const learnTime = formatLearnTime(avgDur, pkg, kind);
  const resourceName = resourceDisplayName(pkg, kind);
  const targeted = pkg.weak_points_targeted?.length
    ? pkg.weak_points_targeted
    : pkg.learner_snapshot?.weak_points || [];
  const weakRel = targeted.slice(0, 2).join("、") || "未关联";
  const Icon = meta.icon;

  return (
    <section className="space-y-3">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
        <header className="mb-3 flex items-center gap-2.5">
          <span
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-white shadow-[0_6px_16px_-8px_rgba(0,0,0,0.4)]"
            style={{
              background: `linear-gradient(135deg, ${meta.hex} 0%, ${meta.hex2} 100%)`,
            }}
          >
            <Icon size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="line-clamp-2 text-[13.5px] font-semibold leading-tight">
              {resourceName}
            </h3>
            <p className="mt-0.5 text-[10.5px] text-[var(--muted-foreground)]">
              来自 · {truncate(pkg.title, 16)}
            </p>
          </div>
        </header>

        <dl className="space-y-1.5 text-[11.5px] leading-5">
          <Field label="适用阶段" value={stageInfo.label} />
          <Field label="关联薄弱点" value={weakRel} />
          <Field label="学习时间" value={learnTime} />
          <Field
            label="来源知识点"
            value={sourcePoints.length ? sourcePoints.join("、") : "等待 KG 抽取"}
          />
        </dl>

        <div className="mt-3 flex flex-wrap gap-1.5">
          <ActionBtn
            label="打开完整"
            primary
            onClick={() => {
              const el = document.getElementById(`preview-content-${kind}`);
              el?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          />
          <ActionBtn
            label="加入学习路径"
            onClick={() =>
              onOpenChat(
                `把这个资源包加入当前学习路径作为「${meta.label}」环节: ${pkg.title}`,
              )
            }
          />
          <ActionBtn
            label="重新生成"
            icon={RefreshCw}
            onClick={() =>
              onOpenChat(
                `请重新生成${meta.label}, 围绕「${pkg.topic || pkg.title}」, 提高难度并覆盖薄弱点。`,
              )
            }
          />
        </div>
      </div>

      <div
        id={`preview-content-${kind}`}
        className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4"
      >
        <PreviewContent pkg={pkg} kind={kind} />
      </div>
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-[70px] shrink-0 text-[var(--muted-foreground)]">{label}</dt>
      <dd className="min-w-0 flex-1 text-[var(--foreground)]">{value}</dd>
    </div>
  );
}

function ActionBtn({
  label,
  primary = false,
  icon: Icon,
  onClick,
}: {
  label: string;
  primary?: boolean;
  icon?: LucideIcon;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[11.5px] font-medium transition active:scale-[0.97] ${
        primary
          ? "bg-gradient-to-r from-[#007AFF] to-[#7c3aed] text-white hover:opacity-92"
          : "border border-[var(--border)] bg-[var(--card-solid)] text-[var(--foreground)] hover:bg-[var(--muted)]"
      }`}
    >
      {Icon ? <Icon size={11} /> : null}
      {label}
    </button>
  );
}

function PreviewContent({
  pkg,
  kind,
}: {
  pkg: LearningResourcePackage;
  kind: ResourceKindKey;
}) {
  switch (kind) {
    case "lecture": {
      const lecture = pkg.resources.micro_lecture;
      if (!lecture) return <NoContent label="微讲义" />;
      return (
        <div>
          <p className="mb-2 text-[12.5px] font-semibold">{lecture.title}</p>
          {lecture.audio_url && (
            <div className="mb-2">
              <audio
                controls
                src={lecture.audio_url}
                className="w-full h-8 rounded"
                preload="metadata"
              />
              {lecture.audio_provider && (
                <span className="mt-0.5 block text-[10px] text-[var(--muted-foreground)]">
                  {lecture.audio_provider}
                </span>
              )}
            </div>
          )}
          <ul className="space-y-1.5">
            {lecture.sections.slice(0, 3).map((s) => (
              <li
                key={s.title}
                className="rounded-lg bg-[var(--muted)] px-2.5 py-1.5 text-[11.5px] leading-5"
              >
                <span className="font-medium">{s.title}</span>
                <span className="text-[var(--muted-foreground)]"> · {truncate(s.summary, 56)}</span>
              </li>
            ))}
          </ul>
        </div>
      );
    }
    case "mindmap": {
      if (!pkg.resources.mindmap?.nodes?.length) return <NoContent label="思维导图" />;
      return <ResourceMindMap pkg={pkg} />;
    }
    case "quiz": {
      const quiz = pkg.resources.quiz;
      const q = quiz?.data?.single_choice_questions?.slice(0, 2) ?? [];
      if (!q.length) return <NoContent label="章节习题" />;
      return (
        <ol className="space-y-2 text-[11.5px] leading-5">
          {q.map((item, i) => (
            <li key={i} className="rounded-lg bg-[var(--muted)] px-2.5 py-2">
              <p className="font-medium">
                {i + 1}. {item.question}
              </p>
              {item.options?.length ? (
                <ul className="mt-1 space-y-0.5 text-[var(--muted-foreground)]">
                  {item.options.slice(0, 4).map((opt, j) => (
                    <li key={j}>
                      {String.fromCharCode(65 + j)}. {opt}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ol>
      );
    }
    case "code": {
      if (!pkg.resources.code_lab?.snippets?.length) return <NoContent label="代码案例" />;
      return <CodeLabCard codeLab={pkg.resources.code_lab} />;
    }
    case "reading": {
      const cards = pkg.resources.flashcards?.cards ?? [];
      if (!cards.length) return <NoContent label="拓展阅读" />;
      return (
        <ul className="space-y-2">
          {cards.slice(0, 3).map((c, i) => (
            <li
              key={i}
              className="rounded-lg bg-[var(--muted)] px-2.5 py-2 text-[11.5px] leading-5"
            >
              <p className="font-medium">{c.front}</p>
              <p className="text-[var(--muted-foreground)]">{c.back}</p>
            </li>
          ))}
        </ul>
      );
    }
    case "media": {
      if (!pkg.resources.mermaid?.mermaid_code) return <NoContent label="教学动画" />;
      return <MermaidDiagramCard diagram={pkg.resources.mermaid} />;
    }
  }
}

function NoContent({ label }: { label: string }) {
  return (
    <p className="rounded-lg bg-[var(--muted)] px-3 py-4 text-center text-[11.5px] text-[var(--muted-foreground)]">
      {label}: 等待 AI 生成 · 点击"重新生成"或回到学习路径触发
    </p>
  );
}

// ============== 工具 ==============

function countReadyKinds(pkg: LearningResourcePackage): number {
  const ts = new Set<string>();
  for (const a of pkg.assets || []) ts.add(a.type);
  return RESOURCE_KINDS.filter((k) => k.matchTypes.some((t) => ts.has(t))).length;
}

function inferStage(pkg: LearningResourcePackage): { label: string } {
  // 真接后端字段, 不再启发式推断
  if (pkg.generated_for_stage?.label) {
    return { label: pkg.generated_for_stage.label };
  }
  // 极少数老数据回退
  return { label: "Camp 4 · 资源包生成" };
}

/** xAPI 资源 object id (按 kind 取真实 ref id, 没有时回退到 pkg.id+kind). */
function resourceObjectId(
  pkg: LearningResourcePackage,
  kind: ResourceKindKey,
): string {
  switch (kind) {
    case "quiz":
      return pkg.resources.exam?.id || `${pkg.id}:quiz`;
    case "lecture":
      return `${pkg.id}:lecture`;
    case "mindmap":
      return `${pkg.id}:mindmap`;
    case "code":
      return `${pkg.id}:code_lab`;
    case "reading":
      return `${pkg.id}:reading`;
    case "media":
      return `${pkg.id}:media`;
  }
}

/** 真测优先: 有 xAPI 样本走平均, 否则给一个内容长度推算 (并标"估算"). */
function formatLearnTime(
  avg: ResourceAvgDuration | null,
  pkg: LearningResourcePackage,
  kind: ResourceKindKey,
): string {
  if (avg && avg.samples > 0 && avg.avg_seconds > 0) {
    const minutes = Math.max(1, Math.round(avg.avg_seconds / 60));
    return `平均 ${minutes} 分钟 · ${avg.samples} 次记录`;
  }
  let est = 6;
  switch (kind) {
    case "lecture":
      est = (pkg.resources.micro_lecture?.sections.length ?? 3) * 5;
      break;
    case "mindmap":
      est = 8;
      break;
    case "quiz":
      est = (pkg.resources.quiz?.question_count ?? 5) * 2;
      break;
    case "code":
      est = (pkg.resources.code_lab?.snippets?.length ?? 1) * 10;
      break;
    case "reading":
      est = Math.max(3, pkg.resources.flashcards?.cards?.length ?? 3);
      break;
    case "media":
      est = 6;
      break;
  }
  return `约 ${est} 分钟 · 估算`;
}

function resourceDisplayName(
  pkg: LearningResourcePackage,
  kind: ResourceKindKey,
): string {
  const topic = pkg.topic || pkg.title;
  switch (kind) {
    case "lecture":
      return pkg.resources.micro_lecture?.title || `${topic} · 微讲义`;
    case "mindmap":
      return pkg.resources.mindmap?.title || `${topic} 知识结构思维导图`;
    case "quiz":
      return pkg.resources.exam?.title || `${topic} · 章节习题`;
    case "code":
      return pkg.resources.code_lab?.title || `${topic} · 代码案例`;
    case "reading":
      return pkg.resources.flashcards?.title || `${topic} · 知识卡片`;
    case "media":
      return pkg.resources.mermaid?.title || `${topic} · 可视化图表`;
  }
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "刚刚更新";
  if (m < 60) return `${m} 分钟前更新`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前更新`;
  return `${Math.floor(h / 24)} 天前更新`;
}

function truncate(s: string, n: number): string {
  if (!s) return "";
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}

// ============== 空态 ==============

function EmptyWorkshop() {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-8 text-center">
      <Wand2 size={26} className="mx-auto mb-2.5 text-[var(--primary)]" />
      <h2 className="text-[15.5px] font-semibold">工坊待启动</h2>
      <p className="mx-auto mt-1.5 max-w-md text-[12.5px] leading-5 text-[var(--muted-foreground)]">
        点击左上"从当前路径生成资源包", 或回到学习路径页发起。
        系统会按目标 → 薄弱点 → 知识库 三步匹配, 多智能体协同生成 6 类资源。
      </p>
    </div>
  );
}
