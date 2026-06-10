"use client";

import { useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { AlertCircle, ArrowLeft, Database, KeyRound, Sparkles } from "lucide-react";
import { apiUrl, apiFetch } from "@/lib/api";
import { showError, showSuccess } from "@/components/ui/Toast";
const CredentialSettingsPanel = dynamic(() => import("@/components/settings/CredentialSettingsPanel").then(m => ({ default: m.CredentialSettingsPanel })), { ssr: false, loading: () => null });

/**
 * 当页面没数据时显示这个引导卡，告诉用户该做什么 —— 不再让人看到白屏。
 * 三个动作：
 * 1. 一键填充演示数据（POST /api/v1/demo/seed）
 * 2. 去主界面发消息（创建真实会话）
 * 3. 打开 API Key 设置面板
 */
interface EmptyStateGuideProps {
  title?: string;
  hint?: string;
  showSeedButton?: boolean;
  backHref?: string;
}

export function EmptyStateGuide({
  title = "暂无数据",
  hint = "这个页面还没有数据可以展示。你可以选下面任意一种方式开始：",
  showSeedButton = true,
  backHref = "/chat",
}: EmptyStateGuideProps) {
  const [seeding, setSeeding] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  async function handleSeed() {
    setSeeding(true);
    try {
      const r = await apiFetch("/api/v1/demo/seed", { method: "POST" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      showSuccess(
        `✅ 已填充演示数据 · KG ${data.kg_nodes ?? 0} 节点 / BKT ${data.bkt_kcs ?? 0} 知识点 · 刷新本页查看`,
        6000,
      );
      // 自动刷新本页
      setTimeout(() => window.location.reload(), 800);
    } catch (err) {
      showError(`填充失败：${(err as Error).message}`);
    } finally {
      setSeeding(false);
    }
  }

  return (
    <div className="mx-auto my-8 max-w-2xl rounded-3xl border border-[var(--border)] bg-[var(--card)] p-8 text-center shadow-sm">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
        <AlertCircle size={28} />
      </div>
      <h2 className="text-lg font-semibold text-[var(--foreground)]">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--muted-foreground)]">
        {hint}
      </p>

      <div className="mt-6 grid gap-3 text-left sm:grid-cols-2">
        {showSeedButton ? (
          <button
            type="button"
            disabled={seeding}
            onClick={handleSeed}
            className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-left transition hover:border-emerald-300 hover:shadow disabled:opacity-60"
          >
            <Database size={18} className="mt-0.5 shrink-0 text-emerald-700" />
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold text-emerald-800">
                {seeding ? "填充中…" : "一键填充演示数据"}
              </span>
              <span className="mt-0.5 block text-[11px] leading-4 text-emerald-700">
                自动创建"小明"演示账号 + 8 节点 KG + 12 知识点 BKT + 6 张复习卡
              </span>
            </span>
          </button>
        ) : null}

        <Link
          href={backHref}
          className="flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-3 transition hover:border-blue-300 hover:shadow"
        >
          <Sparkles size={18} className="mt-0.5 shrink-0 text-blue-700" />
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-semibold text-blue-800">
              去主界面发消息
            </span>
            <span className="mt-0.5 block text-[11px] leading-4 text-blue-700">
              发一条消息自动创建会话，数据就会出现在所有页面里
            </span>
          </span>
        </Link>

        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="flex items-start gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card-solid)] p-3 text-left transition hover:border-[var(--primary)] hover:shadow"
        >
          <KeyRound size={18} className="mt-0.5 shrink-0 text-[var(--muted-foreground)]" />
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-semibold text-[var(--foreground)]">
              配置 API Key
            </span>
            <span className="mt-0.5 block text-[11px] leading-4 text-[var(--muted-foreground)]">
              没配 Key？这里填一次即可。仅存本浏览器，不上传服务端
            </span>
          </span>
        </button>

        <Link
          href={backHref}
          className="flex items-start gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card-solid)] p-3 transition hover:border-[var(--primary)] hover:shadow"
        >
          <ArrowLeft size={18} className="mt-0.5 shrink-0 text-[var(--muted-foreground)]" />
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-semibold text-[var(--foreground)]">
              返回学习工作台
            </span>
            <span className="mt-0.5 block text-[11px] leading-4 text-[var(--muted-foreground)]">
              主界面是所有功能的入口
            </span>
          </span>
        </Link>
      </div>

      <CredentialSettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
