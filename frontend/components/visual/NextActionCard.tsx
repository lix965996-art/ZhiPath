"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Compass,
  Loader2,
  Play,
  Sparkles,
  Target,
  TimerReset,
} from "lucide-react";
import {
  apiFetch,
  getKGSuggestions,
  getMastery,
  type KGSuggestion,
  type MasteryKC,
  type MasterySnapshot,
} from "@/lib/api";

interface Props {
  sessionId?: string;
  onPick: (prompt: string, capability: string) => void;
}

interface FocusKC {
  label: string;
  mastery: number;
}

/**
 * 「下一步该做什么」聚合卡。
 *
 * 别处都没回答这个问题：
 * - 左侧导航 = 跳哪里
 * - 右侧详情 = 看数据
 * - Dashboard = 历史回顾
 * 这里 = 现在这一刻最值得做的事 (KG 推荐 + FSRS 到期 + BKT 薄弱)。
 *
 * 数据合成自三个真接口，零 mock。
 */
export function NextActionCard({ sessionId, onPick }: Props) {
  const [loading, setLoading] = useState(true);
  const [suggestion, setSuggestion] = useState<KGSuggestion | null>(null);
  const [dueCount, setDueCount] = useState<number>(0);
  const [weakKCs, setWeakKCs] = useState<FocusKC[]>([]);

  useEffect(() => {
    if (!sessionId) {
      setLoading(false);
      return;
    }
    let cancel = false;
    setLoading(true);

    Promise.allSettled([
      getKGSuggestions(sessionId, 0.6, 1),
      apiFetch(`/api/v1/review/${sessionId}/due?limit=50`).then((r) =>
        r.ok ? r.json() : [],
      ),
      getMastery(sessionId),
    ])
      .then((results) => {
        if (cancel) return;
        // KG suggest
        if (results[0].status === "fulfilled" && results[0].value.length > 0) {
          setSuggestion(results[0].value[0]);
        } else {
          setSuggestion(null);
        }
        // FSRS due
        if (
          results[1].status === "fulfilled" &&
          Array.isArray(results[1].value)
        ) {
          setDueCount(results[1].value.length);
        } else {
          setDueCount(0);
        }
        // BKT weak
        if (results[2].status === "fulfilled") {
          const ms = results[2].value as MasterySnapshot;
          const weak: FocusKC[] = [...ms.kcs]
            .filter((k: MasteryKC) => k.attempts > 0 && k.mastery < 0.55)
            .sort((a, b) => a.mastery - b.mastery)
            .slice(0, 3)
            .map((k) => ({ label: k.label, mastery: k.mastery }));
          setWeakKCs(weak);
        } else {
          setWeakKCs([]);
        }
      })
      .finally(() => {
        if (!cancel) setLoading(false);
      });

    return () => {
      cancel = true;
    };
  }, [sessionId]);

  /** 聚合三种信号，选一个最有价值的主推荐。 */
  const primary = useMemo<{
    text: string;
    detail: string;
    capability: string;
    prompt: string;
    icon: typeof Compass;
    tint: string;
  }>(() => {
    // 优先 1: 有薄弱点 → 推动画讲解补救
    if (weakKCs.length > 0) {
      const top = weakKCs[0];
      return {
        text: `补救薄弱点：${top.label}`,
        detail: `当前掌握 ${Math.round(top.mastery * 100)}%。建议先看一段动画讲解，再做 3 道针对题。`,
        capability: "explainer",
        prompt: `用动画讲清楚 ${top.label}，最后给 3 道针对练习`,
        icon: Target,
        tint: "from-rose-500/30 to-rose-700/0",
      };
    }
    // 优先 2: KG 有推荐 → 推下个新知识点
    if (suggestion) {
      return {
        text: `下一个该学：${suggestion.node.label}`,
        detail: `前置都已就绪。难度 ${(suggestion.node.difficulty * 100).toFixed(0)}%，现在最适合开。`,
        capability: "resource_gen",
        prompt: `围绕「${suggestion.node.label}」生成一份完整学习资源包：讲义 + 5 道题 + 闪卡 + 知识结构`,
        icon: BookOpen,
        tint: "from-cyan-500/30 to-cyan-700/0",
      };
    }
    // 优先 3: 有待复习 → 推复习
    if (dueCount > 0) {
      return {
        text: `今日待复习 ${dueCount} 张卡片`,
        detail: "按 FSRS 间隔重复算法，今天到期。先清完再学新内容，记忆效率最高。",
        capability: "agentic",
        prompt: "今天该复习什么？给我一份当下最该看的内容",
        icon: TimerReset,
        tint: "from-amber-500/30 to-amber-700/0",
      };
    }
    // 优先 4: 都没数据 → 推全流程闭环
    return {
      text: "从一次完整学习闭环开始",
      detail:
        "把你的目标告诉 Auto-Tutor，它会自动诊断 → 出资源 → 测验 → 重规划。一气呵成。",
      capability: "auto_tutor",
      prompt: "我想 2 周入门机器学习，帮我跑一次完整的学习闭环",
      icon: Sparkles,
      tint: "from-violet-500/30 to-violet-700/0",
    };
  }, [weakKCs, suggestion, dueCount]);

  const followUps = useMemo(() => {
    const out: Array<{ label: string; prompt: string; capability: string }> = [];
    if (weakKCs.length > 0 && primary.capability !== "explainer") {
      out.push({
        label: `讲清楚「${weakKCs[0].label}」`,
        prompt: `用动画讲清楚 ${weakKCs[0].label}`,
        capability: "explainer",
      });
    }
    if (suggestion && primary.capability !== "resource_gen") {
      out.push({
        label: `学「${suggestion.node.label}」`,
        prompt: `围绕「${suggestion.node.label}」生成学习资源`,
        capability: "resource_gen",
      });
    }
    if (dueCount > 0 && primary.capability !== "agentic") {
      out.push({
        label: `复习 ${dueCount} 张`,
        prompt: "今天该复习什么？给我一份当下最该看的内容",
        capability: "agentic",
      });
    }
    if (out.length < 3) {
      out.push({
        label: "让 AI 自己决定",
        prompt: "根据我的画像和掌握度告诉我接下来该学什么",
        capability: "agentic",
      });
    }
    return out.slice(0, 3);
  }, [weakKCs, suggestion, dueCount, primary.capability]);

  if (loading) {
    return (
      <div className="my-6 flex items-center justify-center rounded-3xl border border-[var(--border)] bg-[var(--card)] py-12">
        <Loader2
          size={18}
          className="animate-spin text-[var(--muted-foreground)]"
        />
      </div>
    );
  }

  const Icon = primary.icon;

  return (
    <section className="my-6 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">
      <div className="p-5">
        <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-[var(--muted)] px-2.5 py-1 text-[11px] font-medium text-[var(--muted-foreground)]">
          <Compass size={11} />
          下一步建议
        </div>

        <div className="flex items-start gap-3">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[var(--primary)] bg-[var(--primary)]/10"
          >
            <Icon size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-[20px] font-semibold leading-tight text-[var(--foreground)]">
              {primary.text}
            </h2>
            <p className="mt-1.5 text-[13px] leading-6 text-[var(--muted-foreground)]">
              {primary.detail}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onPick(primary.prompt, primary.capability)}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-[12px] font-medium text-white transition hover:bg-[var(--primary)]/90 active:scale-[0.97]"
        >
          <Play size={13} />
          现在开始
          <ArrowRight size={13} />
        </button>

        {/* 信号摘要：三个真实数据点 */}
        {(weakKCs.length > 0 || dueCount > 0 || suggestion) ? (
          <div className="mt-5 flex flex-wrap gap-1.5 text-[11px]">
            {weakKCs.length > 0 ? (
              <Chip
                label={`薄弱 ${weakKCs.length}`}
                detail={weakKCs.map((k) => k.label).join(" / ")}
                color="#f43f5e"
              />
            ) : null}
            {dueCount > 0 ? (
              <Chip
                label={`今日复习 ${dueCount}`}
                detail="FSRS 间隔重复"
                color="#f59e0b"
              />
            ) : null}
            {suggestion ? (
              <Chip
                label={`KG 推荐：${suggestion.node.label}`}
                detail="前置已就绪"
                color="#06b6d4"
              />
            ) : null}
          </div>
        ) : (
          <p className="mt-5 text-[11px] text-[var(--muted-foreground)]">
            还没有学习数据。开始一次对话或填充演示数据即可激活智能建议。
          </p>
        )}
      </div>

      {/* 备选 follow-ups */}
      {followUps.length > 0 ? (
        <div className="grid gap-1 border-t border-[var(--border)] p-2 sm:grid-cols-3">
          {followUps.map((f) => (
            <button
              key={f.label}
              type="button"
              onClick={() => onPick(f.prompt, f.capability)}
              className="rounded-2xl px-3 py-2 text-left text-[12px] text-[var(--foreground)] transition hover:bg-[var(--muted)] active:scale-[0.98]"
              title={f.prompt}
            >
              {f.label}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function Chip({
  label,
  detail,
  color,
}: {
  label: string;
  detail: string;
  color: string;
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-2 py-0.5 backdrop-blur dark:bg-white/10"
      title={detail}
    >
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: color }}
      />
      <span className="text-[var(--foreground)]">{label}</span>
    </span>
  );
}
