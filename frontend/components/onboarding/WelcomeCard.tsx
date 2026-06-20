"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { KeyRound, Sparkles, X } from "lucide-react";
import { loadApiConfigs, onCredentialsChanged } from "@/lib/credentials";
const CredentialSettingsPanel = dynamic(() => import("@/components/settings/CredentialSettingsPanel").then(m => ({ default: m.CredentialSettingsPanel })), { ssr: false, loading: () => null });

const STORAGE_KEY = "zhipath-onboarding-dismissed-v1";

/**
 * 首次打开 /chat 时弹出的欢迎卡，只负责配置 API Key。
 *
 * 所有学情数据都来自真实使用（对话、资源生成、测验），系统不预置任何假数据。
 * 用户点"完成"或"以后再说"后写 localStorage，永不再弹。
 */
export function WelcomeCard() {
  const [open, setOpen] = useState(false);
  const [hasCred, setHasCred] = useState(false);
  const [credPanelOpen, setCredPanelOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const dismissed = window.localStorage.getItem(STORAGE_KEY);
    if (!dismissed) setOpen(true);
    setHasCred(loadApiConfigs().some((c) => c.apiKey));
    return onCredentialsChanged(() => {
      setHasCred(loadApiConfigs().some((c) => c.apiKey));
    });
  }, []);

  function dismiss() {
    setOpen(false);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, "1");
    }
  }

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-[8000] flex items-center justify-center bg-black/40 backdrop-blur-sm">
        <div className="relative w-full max-w-xl rounded-3xl border border-[var(--border)] bg-[var(--card-solid)] shadow-2xl">
          <button
            type="button"
            onClick={dismiss}
            className="absolute right-4 top-4 rounded-full p-1.5 text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
            title="关闭引导"
          >
            <X size={16} />
          </button>

          <div className="px-7 pt-7 pb-3">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[rgba(59,130,246,0.1)] px-3 py-1 text-xs font-medium text-[var(--primary)]">
              <Sparkles size={13} />
              欢迎使用 ZhiPath
            </div>
            <h2 className="text-xl font-semibold text-[var(--foreground)]">
              配置模型后开始答疑
            </h2>
            <p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">
              API Key 只保存在当前浏览器中。
            </p>
          </div>

          <div className="px-7 py-5">
            <p className="mb-3 text-sm leading-6 text-[var(--foreground)]">
              在本浏览器填写一次 LLM API Key，即可使用导师答疑。
            </p>
            <button
              type="button"
              onClick={() => setCredPanelOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-full bg-[var(--primary)] px-4 py-2 text-xs font-semibold text-white shadow hover:bg-[var(--primary-dark)]"
            >
              <KeyRound size={13} />
              配置 API Key
            </button>
            {hasCred ? (
              <p className="mt-3 text-xs font-medium text-emerald-700">
                已检测到本浏览器配置的 Key
              </p>
            ) : null}
          </div>

          <footer className="flex items-center justify-between gap-3 border-t border-[var(--border)] bg-[var(--card)] px-7 py-3">
            <button
              type="button"
              onClick={dismiss}
              className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            >
              不再显示
            </button>
            <button
              type="button"
              onClick={dismiss}
              className="rounded-full bg-[var(--primary)] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[var(--primary-dark)]"
            >
              进入答疑
            </button>
          </footer>
        </div>
      </div>

      <CredentialSettingsPanel
        open={credPanelOpen}
        onClose={() => setCredPanelOpen(false)}
      />
    </>
  );
}
