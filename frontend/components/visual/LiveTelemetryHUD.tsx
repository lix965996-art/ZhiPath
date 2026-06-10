"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Brain,
  Cpu,
  Database,
  GitBranch,
  MessageSquare,
  Network,
  Radio,
  Rocket,
  Sparkles,
  Wand2,
  Zap,
  type LucideIcon,
} from "lucide-react";
import {
  apiFetch,
  getMastery,
  type MasteryKC,
  type MasterySnapshot,
} from "@/lib/api";
import type { ChatState } from "@/context/ChatContext";

interface Props {
  state: ChatState;
  sessionId?: string;
  isStreaming?: boolean;
  onPick: (prompt: string, capability: string) => void;
}

interface QuickAction {
  id: string;
  label: string;
  prompt: string;
  capability: string;
  icon: LucideIcon;
  accent: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    id: "agentic",
    label: "智能路由",
    prompt: "根据我的画像和掌握度告诉我接下来该学什么",
    capability: "agentic",
    icon: Sparkles,
    accent: "from-violet-500/40 to-violet-700/0",
  },
  {
    id: "resource",
    label: "资源生成",
    prompt: "为机器学习入门生成一份完整资源包，含讲义+测验+闪卡",
    capability: "resource_gen",
    icon: Wand2,
    accent: "from-cyan-500/40 to-cyan-700/0",
  },
  {
    id: "auto",
    label: "Auto-Tutor",
    prompt: "我想 2 周入门机器学习，请帮我跑一次完整学习闭环",
    capability: "auto_tutor",
    icon: Rocket,
    accent: "from-emerald-500/40 to-emerald-700/0",
  },
  {
    id: "debate",
    label: "辩论",
    prompt: "刷题和看书谁更适合机器学习入门？让 AI 们辩论",
    capability: "debate",
    icon: MessageSquare,
    accent: "from-amber-500/40 to-amber-700/0",
  },
  {
    id: "explainer",
    label: "动画讲解",
    prompt: "用动画讲清楚反向传播怎么工作",
    capability: "explainer",
    icon: Brain,
    accent: "from-rose-500/40 to-rose-700/0",
  },
];

/**
 * 实时遥测 HUD。
 * 替换之前的装饰性 3D 场景。所有数据都是后端真实状态：
 * - 当前 capability + 流式状态
 * - StreamBus 来的 agent_message / tool_call 实时流
 * - BKT TOP 6 掌握度条 (每 5s 拉一次)
 * - KG 节点/边计数（来自 state）
 * - 5 个能力快捷启动
 */
export function LiveTelemetryHUD({
  state,
  sessionId,
  isStreaming,
  onPick,
}: Props) {
  // 拉 BKT 数据 (节流 5s)
  const [mastery, setMastery] = useState<MasterySnapshot | null>(null);
  useEffect(() => {
    if (!sessionId) {
      setMastery(null);
      return;
    }
    let cancel = false;
    function refresh() {
      getMastery(sessionId!)
        .then((d) => {
          if (!cancel) setMastery(d);
        })
        .catch(() => undefined);
    }
    refresh();
    const t = setInterval(refresh, 5000);
    return () => {
      cancel = true;
      clearInterval(t);
    };
  }, [sessionId, state.messages.length]);

  // 拉 KG (节流)
  const [kg, setKg] = useState<{ nodes: number; edges: number } | null>(null);
  useEffect(() => {
    if (!sessionId) {
      setKg(null);
      return;
    }
    let cancel = false;
    apiFetch(`/api/v1/kg/${sessionId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancel && data) {
          setKg({
            nodes: data.nodes?.length ?? 0,
            edges: data.edges?.length ?? 0,
          });
        }
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, [sessionId, state.messages.length]);

  const activeAgents = useMemo(
    () =>
      Object.values(state.agentNodes).filter((n) => n.status === "running"),
    [state.agentNodes],
  );

  const recentEdges = useMemo(
    () => [...state.agentEdges].slice(-6).reverse(),
    [state.agentEdges],
  );

  const topKCs: MasteryKC[] = useMemo(() => {
    if (!mastery) return [];
    return [...mastery.kcs].sort((a, b) => b.attempts - a.attempts).slice(0, 6);
  }, [mastery]);

  const totalAgentCalls = Object.keys(state.agentNodes).length;
  const liveStreams = isStreaming ? activeAgents.length || 1 : 0;

  return (
    <div className="relative my-6 overflow-hidden rounded-3xl border border-white/10 bg-[#070814] text-white shadow-[0_30px_80px_-30px_rgba(124,58,237,0.5)]">
      <BackgroundGrid />

      {/* Header bar */}
      <header className="relative z-10 flex items-center justify-between border-b border-white/10 bg-white/5 px-5 py-3 backdrop-blur">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2.5 w-2.5">
            <span
              className={`absolute inline-flex h-full w-full rounded-full ${
                isStreaming ? "animate-ping bg-emerald-400" : "bg-slate-500"
              } opacity-75`}
            />
            <span
              className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
                isStreaming ? "bg-emerald-400" : "bg-slate-400"
              }`}
            />
          </span>
          <span className="text-[12px] font-semibold tracking-wider text-white/85">
            LEARNFLOW · 实时控制台
          </span>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-white/55">
          <span>{state.messages.length} msg</span>
          <span className="text-white/20">·</span>
          <span>{totalAgentCalls} agent</span>
          <span className="text-white/20">·</span>
          <span>{state.agentEdges.length} flow</span>
          <span className="text-white/20">·</span>
          <span className={`${isStreaming ? "text-emerald-300" : ""}`}>
            {isStreaming ? "● 流式中" : "○ 空闲"}
          </span>
        </div>
      </header>

      {/* Main grid */}
      <div className="relative z-10 grid gap-3 p-4 md:grid-cols-3">
        {/* 1. 系统状态 */}
        <Card title="运行时" icon={Cpu}>
          <Metric label="活跃 Agent" value={liveStreams} sub={`/ ${totalAgentCalls} 累计`} />
          <Metric
            label="当前能力"
            value={state.activeCapability || "—"}
            sub={state.isStreaming ? "运行中" : "等待"}
            text
          />
          <Metric
            label="最近阶段"
            value={state.activeStages[state.activeStages.length - 1] || "—"}
            text
            sub={`${state.activeStages.length} 阶段并行`}
          />
        </Card>

        {/* 2. 多智能体通信流 */}
        <Card title="智能体调用" icon={Network}>
          {recentEdges.length === 0 ? (
            <p className="py-4 text-center text-[11px] text-white/40">
              发送消息后这里会实时流出 Agent 调用
            </p>
          ) : (
            <ul className="space-y-1.5">
              {recentEdges.map((e) => (
                <li
                  key={e.id}
                  className="flex items-center justify-between gap-2 rounded-lg bg-white/5 px-2 py-1.5 text-[10.5px] hover:bg-white/10"
                >
                  <span className="truncate font-mono text-cyan-300">
                    {e.from}
                  </span>
                  <span className="text-white/30">→</span>
                  <span className="truncate font-mono text-violet-300">
                    {e.to}
                  </span>
                  {e.label ? (
                    <span className="ml-auto shrink-0 rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] text-white/60">
                      {e.label}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* 3. KG / 知识库 */}
        <Card title="知识图谱" icon={GitBranch}>
          {kg ? (
            <>
              <Metric label="KG 节点" value={kg.nodes} sub={`${kg.edges} 条依赖`} />
            </>
          ) : (
            <Metric label="KG 节点" value="—" sub="尚未生成" />
          )}
          {mastery ? (
            <>
              <Metric
                label="平均掌握度"
                value={`${Math.round(mastery.summary.avg_mastery * 100)}%`}
                sub={`${mastery.summary.count} 知识点`}
              />
              <Metric
                label="薄弱 / 已巩固"
                value={`${mastery.summary.weak} / ${mastery.summary.mature}`}
                sub="BKT 实时"
                text
              />
            </>
          ) : (
            <Metric label="掌握度" value="—" sub="发消息后启动" text />
          )}
        </Card>
      </div>

      {/* BKT 实时柱 */}
      {topKCs.length > 0 ? (
        <section className="relative z-10 border-t border-white/10 px-4 py-3">
          <header className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-wider text-white/55">
            <Activity size={11} />
            实时掌握度 BKT · TOP {topKCs.length}
          </header>
          <div className="space-y-1.5">
            {topKCs.map((k) => (
              <div
                key={k.kc_id}
                className="flex items-center gap-3 text-[10.5px]"
              >
                <span className="w-32 shrink-0 truncate text-white/80">
                  {k.label}
                </span>
                <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/5">
                  <div
                    className="h-full rounded-full transition-all duration-700 ease-out"
                    style={{
                      width: `${k.mastery * 100}%`,
                      background:
                        "linear-gradient(90deg, #06b6d4, #7c3aed, #f43f5e)",
                      boxShadow: "0 0 12px rgba(124,58,237,0.5)",
                    }}
                  />
                </div>
                <span className="w-12 text-right font-mono text-white/70">
                  {Math.round(k.mastery * 100)}%
                </span>
                <span className="w-12 text-right text-white/40">
                  {k.correct}/{k.attempts}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* 快捷启动 */}
      <section className="relative z-10 border-t border-white/10 px-4 py-3">
        <header className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-wider text-white/55">
          <Zap size={11} />
          能力快捷
        </header>
        <div className="grid gap-1.5 sm:grid-cols-3 lg:grid-cols-5">
          {QUICK_ACTIONS.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => onPick(a.prompt, a.capability)}
              disabled={isStreaming}
              className="group relative overflow-hidden rounded-xl border border-white/10 bg-white/5 p-2.5 text-left transition hover:border-white/30 hover:bg-white/10 active:scale-[0.97] disabled:opacity-50"
            >
              <div
                className={`absolute inset-0 bg-gradient-to-br ${a.accent} opacity-0 transition group-hover:opacity-100`}
              />
              <div className="relative flex items-start gap-2">
                <a.icon size={14} className="mt-0.5 shrink-0 text-white/85" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-semibold text-white">
                    {a.label}
                  </p>
                  <p className="line-clamp-2 text-[10px] leading-4 text-white/55">
                    {a.prompt.slice(0, 38)}...
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* 底部 ticker */}
      <footer className="relative z-10 flex items-center justify-between gap-3 border-t border-white/10 bg-white/5 px-4 py-2 text-[10px] text-white/50">
        <span className="flex items-center gap-1.5">
          <Radio size={10} className={isStreaming ? "text-emerald-400" : ""} />
          {isStreaming ? "WebSocket 流式中" : "WebSocket 待命"}
        </span>
        <span>
          {sessionId ? `session ${sessionId.slice(0, 8)}` : "no session"}
        </span>
        <span className="hidden sm:inline">
          {new Date().toLocaleTimeString("zh-CN", { hour12: false })}
        </span>
      </footer>
    </div>
  );
}

// ---- Helpers ----

function Card({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <header className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/55">
        <Icon size={11} />
        {title}
      </header>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}

function Metric({
  label,
  value,
  sub,
  text,
}: {
  label: string;
  value: number | string;
  sub?: string;
  text?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 rounded-lg bg-white/[0.02] px-2 py-1.5">
      <span className="text-[10.5px] text-white/60">{label}</span>
      <span className="flex items-baseline gap-1.5">
        <span
          className={`font-mono text-white ${
            text ? "text-[11px] truncate max-w-[120px]" : "text-[15px] font-semibold"
          }`}
          style={{ textShadow: "0 0 10px rgba(124,58,237,0.4)" }}
        >
          {value}
        </span>
        {sub ? (
          <span className="text-[9.5px] text-white/40">{sub}</span>
        ) : null}
      </span>
    </div>
  );
}

function BackgroundGrid() {
  return (
    <div className="pointer-events-none absolute inset-0">
      {/* 网格底纹 */}
      <div
        className="absolute inset-0 opacity-25"
        style={{
          backgroundImage:
            "linear-gradient(rgba(124,58,237,0.16) 1px, transparent 1px), linear-gradient(90deg, rgba(124,58,237,0.16) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage:
            "radial-gradient(ellipse at center, black 0%, transparent 75%)",
        }}
      />
      {/* 辐射光晕 */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 30% 20%, rgba(124,58,237,0.25) 0%, transparent 50%), radial-gradient(ellipse at 80% 80%, rgba(6,182,212,0.18) 0%, transparent 50%)",
        }}
      />
    </div>
  );
}
