"use client";

import { useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { AlertCircle, ArrowLeft, KeyRound, Sparkles } from "lucide-react";
const CredentialSettingsPanel = dynamic(() => import("@/components/settings/CredentialSettingsPanel").then(m => ({ default: m.CredentialSettingsPanel })), { ssr: false, loading: () => null });

/**
 * 当页面没数据时显示这个引导卡，告诉用户该做什么 —— 不再让人看到白屏。
 * 所有学情数据都来自真实使用，这里只引导真实动作：
 * 1. 去主界面发消息（创建真实会话、发起资源生成 / 测验）
 * 2. 打开 API Key 设置面板
 * 3. 返回学习工作台
 */
interface EmptyStateGuideProps {
  title?: string;
  hint?: string;
  /** @deprecated 已不再提供演示数据填充，保留以兼容旧调用 */
  showSeedButton?: boolean;
  backHref?: string;
}

export function EmptyStateGuide({
  title = "暂无数据",
  hint = "这个页面的数据来自你的真实使用。去工作台发起一次对话、资源生成或测验，数据就会出现。",
  backHref = "/chat",
}: EmptyStateGuideProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);

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
          className="flex items-start gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card-solid)] p-3 transition hover:border-[var(--primary)] hover:shadow sm:col-span-2"
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
