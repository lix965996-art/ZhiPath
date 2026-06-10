"use client";

import { useEffect, useState } from "react";
import { KeyRound, Settings } from "lucide-react";
import { CredentialSettingsPanel } from "./CredentialSettingsPanel";
import { loadCredentials, onCredentialsChanged } from "@/lib/credentials";

/**
 * 右上角齿轮按钮 + Settings 模态弹窗。
 *
 * 当浏览器已配置任意 Key 时，按钮显示绿点提示"已配置"。
 */
export function SettingsButton() {
  const [open, setOpen] = useState(false);
  const [configured, setConfigured] = useState(false);

  useEffect(() => {
    const recompute = () =>
      setConfigured(Object.keys(loadCredentials()).length > 0);
    recompute();
    return onCredentialsChanged(recompute);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="API Key 设置（仅在本浏览器生效）"
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--card-solid)] text-[var(--foreground)] transition hover:bg-[var(--muted)]"
      >
        <KeyRound size={14} />
        {configured ? (
          <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-emerald-500" />
        ) : null}
      </button>
      <CredentialSettingsPanel open={open} onClose={() => setOpen(false)} />
    </>
  );
}
