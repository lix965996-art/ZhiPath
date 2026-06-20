"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { CheckCircle2, KeyRound, Rocket, Sparkles, X } from "lucide-react";
import { loadApiConfigs, onCredentialsChanged } from "@/lib/credentials";
const CredentialSettingsPanel = dynamic(() => import("@/components/settings/CredentialSettingsPanel").then(m => ({ default: m.CredentialSettingsPanel })), { ssr: false, loading: () => null });
import { type Role, useRole } from "@/context/RoleContext";

const STORAGE_KEY = "zhipath-onboarding-dismissed-v1";

const ROLE_DESC: Record<Role, string> = {
  student: "👨‍🎓 学生：聚焦学习场景，界面更专注",
  showcase: "演示：解锁全部面板（智能体通信、资源流水线等），适合答辩",
};

/**
 * 首次打开 /chat 时弹出的欢迎卡。两步引导：
 * 1. 配置 API Key（或跳过 — 用 .env）
 * 2. 选择角色（学生/演示）
 *
 * 所有学情数据都来自真实使用（对话、资源生成、测验），系统不预置任何假数据。
 * 用户点"完成"或"以后再说"后写 localStorage，永不再弹。
 */
export function WelcomeCard() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [hasCred, setHasCred] = useState(false);
  const [credPanelOpen, setCredPanelOpen] = useState(false);
  const { role, setRole } = useRole();

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
              2 步开始你的个性化学习
            </h2>
            <p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">
              配置 Key、选好角色，就能开始。所有学情数据都来自你的真实使用。
            </p>
          </div>

          {/* 进度指示 */}
          <ol className="grid grid-cols-2 gap-2 border-y border-[var(--border)] bg-[var(--card)] px-7 py-3 text-xs">
            {([1, 2] as const).map((n) => {
              const done = n === 1 && hasCred;
              const isCurrent = step === n;
              return (
                <li
                  key={n}
                  className={`flex items-center gap-2 rounded-full px-2.5 py-1 ${
                    isCurrent
                      ? "bg-[var(--primary)] text-white"
                      : done
                        ? "text-emerald-700"
                        : "text-[var(--muted-foreground)]"
                  }`}
                >
                  {done ? (
                    <CheckCircle2 size={12} />
                  ) : (
                    <span className="inline-flex h-3 w-3 items-center justify-center rounded-full bg-current text-[8px] font-bold opacity-80" style={{ color: isCurrent ? "white" : undefined }}>
                      {n}
                    </span>
                  )}
                  {n === 1 ? "配置 Key" : "选择角色"}
                </li>
              );
            })}
          </ol>

          {/* 各 step 内容 */}
          <div className="px-7 py-5">
            {step === 1 ? (
              <div>
                <p className="mb-3 text-sm leading-6 text-[var(--foreground)]">
                  在 <strong>本浏览器</strong>填一次 LLM API Key，所有功能就能用。
                  <br />
                  <span className="text-xs text-[var(--muted-foreground)]">
                    Key 只存在你电脑里，不会上传我们服务端硬盘。
                  </span>
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setCredPanelOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[var(--primary)] px-4 py-2 text-xs font-semibold text-white shadow hover:bg-[var(--primary-dark)]"
                  >
                    <KeyRound size={13} />
                    去配置 API Key
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--card-solid)] px-4 py-2 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--muted)]"
                  >
                    跳过（用服务端 .env）
                  </button>
                </div>
                {hasCred ? (
                  <p className="mt-3 text-xs font-medium text-emerald-700">
                    ✅ 已检测到本浏览器配置的 Key
                  </p>
                ) : null}
              </div>
            ) : (
              <div>
                <p className="mb-3 text-sm leading-6 text-[var(--foreground)]">
                  选一个角色 — 不同角色界面密度不同，可以随时在右上角切换。
                </p>
                <div className="grid gap-2">
                  {(["student", "showcase"] as Role[]).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRole(r)}
                      className={`flex items-start gap-3 rounded-2xl border p-3 text-left transition ${
                        role === r
                          ? "border-[var(--primary)] bg-[rgba(59,130,246,0.06)]"
                          : "border-[var(--border)] bg-[var(--card)] hover:border-[var(--primary)]"
                      }`}
                    >
                      <Rocket
                        size={16}
                        className={role === r ? "text-[var(--primary)]" : "text-[var(--muted-foreground)]"}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-[var(--foreground)]">
                          {ROLE_DESC[r]}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 底部按钮 */}
          <footer className="flex items-center justify-between gap-3 border-t border-[var(--border)] bg-[var(--card)] px-7 py-3">
            <button
              type="button"
              onClick={dismiss}
              className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            >
              不再显示
            </button>
            <div className="flex items-center gap-2">
              {step > 1 ? (
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="rounded-full border border-[var(--border)] bg-[var(--card-solid)] px-3 py-1.5 text-xs hover:bg-[var(--muted)]"
                >
                  上一步
                </button>
              ) : null}
              {step < 2 ? (
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="rounded-full bg-[var(--primary)] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[var(--primary-dark)]"
                >
                  下一步
                </button>
              ) : (
                <button
                  type="button"
                  onClick={dismiss}
                  className="rounded-full bg-[var(--primary)] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[var(--primary-dark)]"
                >
                  开始使用 →
                </button>
              )}
            </div>
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
