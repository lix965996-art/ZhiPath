"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  BookOpen,
  Bot,
  CalendarDays,
  GraduationCap,
  Route,
  Settings,
  ShieldCheck,
} from "lucide-react";
import { RoleSwitcher } from "@/components/role/RoleSwitcher";

const nav = [
  { href: "/today", label: "今日学习", icon: CalendarDays },
  { href: "/path", label: "学习路径", icon: Route },
  { href: "/resources", label: "学习资源", icon: BookOpen },
  { href: "/dashboard", label: "复习与进度", icon: BarChart3 },
  { href: "/chat", label: "问导师", icon: Bot },
];

export function LearningShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-[#f7f8fc] text-[#172033]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[238px] border-r border-[#e4e9f2] bg-white lg:flex lg:flex-col">
        <div className="flex h-20 items-center gap-3 px-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white">
            <GraduationCap size={22} />
          </div>
          <div>
            <div className="text-lg font-bold tracking-tight">ZhiPath</div>
            <div className="text-xs text-slate-500">408 个性化学习助手</div>
          </div>
        </div>

        <nav className="mt-4 space-y-1 px-3">
          {nav.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== "/today" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium ${
                  active
                    ? "bg-blue-50 text-blue-700 ring-1 ring-blue-100"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <item.icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto space-y-4 border-t border-[#e4e9f2] p-4">
          <div className="rounded-xl bg-slate-50 p-3">
            <div className="text-xs text-slate-500">当前目标</div>
            <div className="mt-1 flex items-center justify-between text-sm font-semibold">
              <span>408 考研</span>
              <span className="text-blue-600">126 天</span>
            </div>
          </div>
          <RoleSwitcher />
          <div className="flex items-center gap-2 px-1 text-xs text-slate-500">
            <Settings size={14} />
            设置
          </div>
        </div>
      </aside>

      <div className="lg:pl-[238px]">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-[#e4e9f2] bg-white/90 px-4 backdrop-blur-xl lg:px-8">
          <Link href="/today" className="flex items-center gap-2 font-semibold lg:hidden">
            <GraduationCap size={20} className="text-blue-600" />
            ZhiPath
          </Link>
          <div className="hidden items-center gap-2 text-xs text-slate-500 lg:flex">
            <ShieldCheck size={15} className="text-emerald-500" />
            学习记录已同步
          </div>
          <div className="lg:hidden">
            <RoleSwitcher compact />
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1320px] px-4 py-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
