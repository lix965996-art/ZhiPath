"use client";

import { GraduationCap, Sparkles, User } from "lucide-react";
import { type Role, useRole } from "@/context/RoleContext";

const OPTIONS: Array<{ value: Role; label: string; icon: typeof User; hint: string }> = [
  { value: "student", label: "学生", icon: User, hint: "聚焦学习场景" },
  { value: "teacher", label: "教师", icon: GraduationCap, hint: "聚焦班级管理" },
  { value: "showcase", label: "演示", icon: Sparkles, hint: "解锁全部炫技" },
];

export function RoleSwitcher({ compact = false }: { compact?: boolean }) {
  const { role, setRole } = useRole();
  return (
    <div
      className={`inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--card)] p-0.5 ${
        compact ? "" : "shadow-sm"
      }`}
    >
      {OPTIONS.map((opt) => {
        const active = role === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => setRole(opt.value)}
            title={opt.hint}
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
              active
                ? "bg-[var(--primary)] text-white shadow"
                : "text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
            }`}
          >
            <opt.icon size={12} />
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
