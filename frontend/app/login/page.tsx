"use client";

import { useState, useCallback, useEffect, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

type Tab = "login" | "register";

export default function LoginPage() {
  const router = useRouter();
  const { login, register, isLoggedIn, isLoading } = useAuth();

  const [tab, setTab] = useState<Tab>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // 已登录则跳转（放在 useEffect 中，避免 render 副作用）
  useEffect(() => {
    if (!isLoading && isLoggedIn) {
      router.replace("/chat");
    }
  }, [isLoading, isLoggedIn, router]);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setError("");

      if (!username.trim() || !password) {
        setError("请填写用户名和密码");
        return;
      }

      if (tab === "register" && password !== confirmPassword) {
        setError("两次密码不一致");
        return;
      }

      if (password.length < 6) {
        setError("密码至少 6 位");
        return;
      }

      setSubmitting(true);
      try {
        if (tab === "login") {
          await login(username.trim(), password);
        } else {
          await register(username.trim(), password);
        }
        router.replace("/chat");
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "操作失败");
      } finally {
        setSubmitting(false);
      }
    },
    [tab, username, password, confirmPassword, login, register, router],
  );

  // 加载中或已登录时显示空白（避免表单闪烁）
  if (isLoading || isLoggedIn) {
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={{ background: "var(--background)" }}>
        <div className="text-sm" style={{ color: "var(--muted-foreground)" }}>加载中…</div>
      </div>
    );
  }

  const switchTab = (t: Tab) => {
    setTab(t);
    setError("");
    setPassword("");
    setConfirmPassword("");
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ background: "var(--background)" }}
    >
      {/* 背景装饰 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute -top-40 -right-40 w-96 h-96 rounded-full blur-3xl opacity-20"
          style={{ background: "var(--primary)" }}
        />
        <div
          className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full blur-3xl opacity-10"
          style={{ background: "var(--primary)" }}
        />
      </div>

      {/* 登录卡片 */}
      <div
        className="relative w-full max-w-md mx-4 rounded-3xl p-8 backdrop-blur-xl"
        style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          boxShadow: "var(--shadow-soft)",
        }}
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <h1
            className="text-3xl font-bold tracking-tight"
            style={{ color: "var(--foreground)" }}
          >
            ZhiPath
          </h1>
          <p
            className="mt-2 text-sm"
            style={{ color: "var(--muted-foreground)" }}
          >
            个性化学习资源生成系统
          </p>
        </div>

        {/* Tab 切换 */}
        <div
          className="flex rounded-2xl p-1 mb-6"
          style={{ background: "var(--muted)" }}
        >
          {(["login", "register"] as const).map((t) => (
            <button
              key={t}
              onClick={() => switchTab(t)}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all duration-200"
              style={{
                background: tab === t ? "var(--card-solid)" : "transparent",
                color:
                  tab === t
                    ? "var(--foreground)"
                    : "var(--muted-foreground)",
                boxShadow:
                  tab === t ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
              }}
            >
              {t === "login" ? "登录" : "注册"}
            </button>
          ))}
        </div>

        {/* 表单 */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              className="block text-sm font-medium mb-1.5"
              style={{ color: "var(--foreground)" }}
            >
              用户名
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="字母、数字、下划线或中文"
              maxLength={50}
              autoComplete="username"
              className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all duration-200"
              style={{
                background: "var(--muted)",
                color: "var(--foreground)",
                border: "1px solid var(--border)",
              }}
            />
          </div>

          <div>
            <label
              className="block text-sm font-medium mb-1.5"
              style={{ color: "var(--foreground)" }}
            >
              密码
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="至少 6 位"
              maxLength={100}
              autoComplete={
                tab === "login" ? "current-password" : "new-password"
              }
              className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all duration-200"
              style={{
                background: "var(--muted)",
                color: "var(--foreground)",
                border: "1px solid var(--border)",
              }}
            />
          </div>

          {tab === "register" && (
            <div>
              <label
                className="block text-sm font-medium mb-1.5"
                style={{ color: "var(--foreground)" }}
              >
                确认密码
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="再次输入密码"
                maxLength={100}
                autoComplete="new-password"
                className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all duration-200"
                style={{
                  background: "var(--muted)",
                  color: "var(--foreground)",
                  border: "1px solid var(--border)",
                }}
              />
            </div>
          )}

          {/* 错误提示 */}
          {error && (
            <div
              className="text-sm text-center py-2 rounded-lg"
              style={{
                color: "#ff3b30",
                background: "rgba(255, 59, 48, 0.08)",
              }}
            >
              {error}
            </div>
          )}

          {/* 提交按钮 */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-all duration-200 disabled:opacity-50"
            style={{
              background: "var(--primary)",
            }}
          >
            {submitting
              ? "处理中..."
              : tab === "login"
                ? "登录"
                : "注册"}
          </button>
        </form>

        {/* 底部提示 */}
        <p
          className="text-center text-xs mt-6"
          style={{ color: "var(--muted-foreground)" }}
        >
          {tab === "login" ? "还没有账号？" : "已有账号？"}
          <button
            onClick={() => switchTab(tab === "login" ? "register" : "login")}
            className="ml-1 font-medium"
            style={{ color: "var(--primary)" }}
          >
            {tab === "login" ? "去注册" : "去登录"}
          </button>
        </p>

        {/* 跳过登录 */}
        <div className="text-center mt-4">
          <button
            onClick={() => router.replace("/chat")}
            className="text-xs"
            style={{ color: "var(--muted-foreground)" }}
          >
            先不登录，直接使用 →
          </button>
        </div>
      </div>
    </div>
  );
}
