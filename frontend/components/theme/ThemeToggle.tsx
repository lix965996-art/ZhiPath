"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "zhipath-theme";

function applyTheme(t: Theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const isDark =
    t === "dark" ||
    (t === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.classList.toggle("dark", isDark);
}

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? "system";
    setTheme(saved);
    applyTheme(saved);
    if (saved === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const listener = () => applyTheme("system");
      mq.addEventListener("change", listener);
      return () => mq.removeEventListener("change", listener);
    }
  }, []);

  function set(next: Theme) {
    setTheme(next);
    if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next);
  }

  const options: Array<{ value: Theme; icon: typeof Sun; label: string }> = [
    { value: "light", icon: Sun, label: "浅色" },
    { value: "dark", icon: Moon, label: "深色" },
    { value: "system", icon: Monitor, label: "跟随系统" },
  ];

  return (
    <div
      className={`inline-flex items-center gap-0.5 rounded-full border border-[var(--border)] bg-[var(--card)] p-0.5 ${
        compact ? "" : "shadow-sm"
      }`}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => set(opt.value)}
          title={opt.label}
          className={`flex h-7 w-7 items-center justify-center rounded-full transition ${
            theme === opt.value
              ? "bg-[var(--primary)] text-white"
              : "text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
          }`}
        >
          <opt.icon size={13} />
        </button>
      ))}
    </div>
  );
}
