"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { LogOut, LogIn } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";

/**
 * 用户菜单按钮：
 * - 已登录：显示用户名首字母，点击弹出退出菜单
 * - 未登录：显示登录图标，点击跳转登录页
 */
export function UserMenu() {
  const { user, isLoggedIn, isLoading, logout } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭菜单
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleLogout = useCallback(async () => {
    await logout();
    setOpen(false);
    router.push("/login");
  }, [logout, router]);

  if (isLoading) {
    return (
      <div className="h-9 w-9 rounded-full bg-[var(--muted)] animate-pulse" />
    );
  }

  if (!isLoggedIn) {
    return (
      <button
        type="button"
        onClick={() => router.push("/login")}
        title="登录"
        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--card-solid)] text-[var(--foreground)] transition hover:bg-[var(--muted)]"
      >
        <LogIn size={14} />
      </button>
    );
  }

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={user?.username || "用户"}
        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--primary)] text-white text-xs font-bold transition hover:opacity-90"
      >
        {(user?.username || "U").charAt(0).toUpperCase()}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-48 rounded-xl py-1 z-50"
          style={{
            background: "var(--card-solid)",
            border: "1px solid var(--border)",
            boxShadow: "var(--shadow-soft)",
          }}
        >
          <div
            className="px-3 py-2 text-xs border-b"
            style={{
              color: "var(--muted-foreground)",
              borderColor: "var(--border)",
            }}
          >
            已登录为 <strong style={{ color: "var(--foreground)" }}>{user?.username}</strong>
          </div>
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm transition hover:bg-[var(--muted)]"
            style={{ color: "var(--foreground)" }}
          >
            <LogOut size={14} />
            退出登录
          </button>
        </div>
      )}
    </div>
  );
}
