"use client";

import { useState } from "react";
import { CheckCircle2, Database, Play, Route, Sparkles, type LucideIcon } from "lucide-react";
import { apiUrl, apiFetch } from "@/lib/api";
import { showError, showInfo, showSuccess } from "@/components/ui/Toast";

export const contestDemoPrompt =
  "我是一名 Python 初学者，循环和条件判断比较薄弱。请先诊断我的学习目标和薄弱点，再生成一份可打印的 Python 基础测试卷。要求包含 5 道选择题、3 道判断题、2 道简答题，满分 100 分，考试时间 45 分钟，并提供 Word 下载、含答案解析版本和 PDF 打印入口。生成后请说明系统如何根据我的答题结果更新学习画像并推荐下一轮补救练习。";

export interface DemoRecipe {
  id: string;
  title: string;
  description: string;
  capability: string;
  prompt: string;
  icon: LucideIcon;
}

export const DEMO_RECIPES: DemoRecipe[] = [
  {
    id: "agentic_full",
    title: "✨ 智能路由 (端到端)",
    description: "AI 自主路由 + KG 查询 + 闭环",
    capability: "agentic",
    icon: Sparkles,
    prompt: "我目标是 2 周入门机器学习，请根据我目前的掌握度告诉我接下来该学什么、并安排一份练习",
  },
  {
    id: "auto_tutor",
    title: "🚀 Auto-Tutor 闭环",
    description: "诊断→生成→自评→重规划 7 阶段",
    capability: "auto_tutor",
    icon: Route,
    prompt: "我是 Python 初学者，对循环和条件判断比较薄弱，请跑一次完整学习闭环",
  },
  {
    id: "resource_full",
    title: "📚 多模态资源包",
    description: "测验+闪卡+导图+代码+音频+Mermaid",
    capability: "resource_gen",
    icon: Database,
    prompt: contestDemoPrompt,
  },
  {
    id: "debate",
    title: "⚔ 多智能体辩论",
    description: "正反方+裁判 2 轮辩论",
    capability: "debate",
    icon: Play,
    prompt: "刷题和看书谁更适合机器学习入门？让 AI 们辩论后给我结论",
  },
];

interface ContestDemoPanelProps {
  compact?: boolean;
  disabled?: boolean;
  onRun: (prompt?: string, capability?: string) => void;
}

const legacyDemoSteps = ["画像诊断", "资源生成", "Word/PDF", "作答反馈", "画像更新"];

export function ContestDemoPanel({
  compact = false,
  disabled = false,
  onRun,
}: ContestDemoPanelProps) {
  const [seeding, setSeeding] = useState(false);

  async function handleSeed() {
    setSeeding(true);
    try {
      const r = await apiFetch("/api/v1/demo/seed", { method: "POST" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      showSuccess(
        `✅ 已填充演示数据：KG ${data.kg_nodes ?? 0} 节点 / BKT ${data.bkt_kcs ?? 0} 知识点 / FSRS ${data.fsrs_cards ?? 0} 张卡`,
        5000,
      );
    } catch (err) {
      showError(`填充失败：${(err as Error).message}`);
    } finally {
      setSeeding(false);
    }
  }

  if (compact) {
    return (
      <div className="mt-4 space-y-2 rounded-2xl border border-[rgba(0,122,255,0.18)] bg-[var(--card)] p-3 shadow-sm">
        <div className="mb-1 flex items-center gap-2 text-[12px] font-semibold">
          <Route size={15} className="text-[var(--primary)]" />
          一键演示
        </div>
        {DEMO_RECIPES.map((r) => (
          <button
            key={r.id}
            type="button"
            disabled={disabled}
            onClick={() => onRun(r.prompt, r.capability)}
            className="flex w-full items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card-solid)] px-2.5 py-1.5 text-left text-[11px] transition hover:border-[rgba(0,122,255,0.4)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <r.icon size={13} className="shrink-0 text-[var(--primary)]" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-[var(--foreground)]">{r.title}</span>
              <span className="block truncate text-[10px] text-[var(--muted-foreground)]">
                {r.description}
              </span>
            </span>
          </button>
        ))}
        <button
          type="button"
          disabled={seeding}
          onClick={handleSeed}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-[11px] font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
        >
          <Database size={12} />
          {seeding ? "填充中…" : "一键填充演示数据"}
        </button>
      </div>
    );
  }

  return (
    <section className="mb-5 rounded-[24px] border border-[rgba(0,122,255,0.18)] bg-[var(--card)] p-4 shadow-[var(--shadow-soft)] backdrop-blur">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-[rgba(0,122,255,0.1)] px-2.5 py-1 text-[12px] font-medium text-[var(--primary)]">
            <Sparkles size={14} />
            完整能力演示
          </div>
          <h3 className="text-[17px] font-semibold">一键体验 ZhiPath 的核心场景</h3>
          <p className="mt-1 max-w-2xl text-[13px] leading-6 text-[var(--muted-foreground)]">
            从智能路由到多智能体辩论，再到 Auto-Tutor 闭环，每个场景一键启动。建议先点"填充演示数据"，再选场景。
          </p>
        </div>
        <button
          type="button"
          disabled={seeding}
          onClick={handleSeed}
          className="inline-flex shrink-0 items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2.5 text-[13px] font-medium text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
        >
          <Database size={15} />
          {seeding ? "填充中…" : "填充演示数据"}
        </button>
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-2">
        {DEMO_RECIPES.map((r) => (
          <button
            key={r.id}
            type="button"
            disabled={disabled}
            onClick={() => onRun(r.prompt, r.capability)}
            className="flex items-start gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card-solid)] p-3 text-left transition hover:border-[rgba(0,122,255,0.5)] hover:shadow disabled:cursor-not-allowed disabled:opacity-50"
          >
            <r.icon size={18} className="mt-0.5 text-[var(--primary)]" />
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold text-[var(--foreground)]">{r.title}</span>
              <span className="mt-0.5 block text-[11px] text-[var(--muted-foreground)]">{r.description}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="mt-3 hidden gap-2 sm:grid sm:grid-cols-5">
        {legacyDemoSteps.map((step) => (
          <div
            key={step}
            className="flex items-center gap-2 rounded-2xl bg-[var(--muted)] px-3 py-2 text-[12px] text-[var(--foreground)]"
          >
            <CheckCircle2 size={14} className="text-[var(--primary)]" />
            {step}
          </div>
        ))}
      </div>
    </section>
  );
}
