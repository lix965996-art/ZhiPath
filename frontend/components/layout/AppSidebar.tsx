"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  BookOpenCheck,
  Boxes,
  Brain,
  History,
  Library,
  MessageSquare,
  PenLine,
  Route,
  UserRound,
  X,
} from "lucide-react";
import { BrandMark } from "@/components/brand/BrandMark";

const primaryNav = [
  { href: "/today", label: "开始学习", icon: BookOpenCheck },
  { href: "/path", label: "学习路径", icon: Route },
  { href: "/resources", label: "学习资源", icon: Boxes },
  { href: "/profile", label: "学习者画像", icon: UserRound },
  { href: "/knowledge", label: "课程知识库", icon: Library },
  { href: "/dashboard", label: "学习记录", icon: BarChart3 },
  { href: "/chat", label: "导师对话", icon: MessageSquare },
];

const capabilityNav = [
  { href: "/today", label: "完成今日任务", icon: BookOpenCheck },
  { href: "/resources", label: "查看资源包", icon: Boxes },
  { href: "/learn/bankers", label: "互动算法实验", icon: Brain },
];

interface AppSidebarProps {
  open?: boolean;
  onClose?: () => void;
  onNewSession?: () => void;
  onShowHistory?: () => void;
  historyActive?: boolean;
  knowledgeCount?: number | null;
}

export function AppSidebar({
  open = false,
  onClose,
  onNewSession,
  onShowHistory,
  historyActive = false,
  knowledgeCount,
}: AppSidebarProps) {
  const pathname = usePathname();

  const closeAfterNavigation = () => onClose?.();

  return (
    <>
      {open ? (
        <button
          type="button"
          aria-label="关闭菜单"
          onClick={onClose}
          className="fixed inset-0 z-30 bg-black/10 backdrop-blur-[2px] lg:hidden"
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col border-r border-[var(--border)] bg-[var(--sidebar)] shadow-[12px_0_40px_rgba(0,0,0,0.06)] transition-transform duration-300 lg:translate-x-0 lg:shadow-none ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-14 items-center gap-3 px-5">
          <BrandMark variant="logo" size={34} className="rounded-xl" />
          <div className="min-w-0">
            <div className="text-[14px] font-semibold">ZhiPath</div>
            <div className="text-[11px] text-[var(--muted-foreground)]">
              个性化学习助手
            </div>
          </div>
          <button
            type="button"
            aria-label="关闭菜单"
            onClick={onClose}
            className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--muted-foreground)] hover:bg-[var(--muted)] lg:hidden"
          >
            <X size={16} />
          </button>
        </div>

        {onNewSession ? (
          <button
            type="button"
            onClick={() => {
              onNewSession();
              onClose?.();
            }}
            className="mx-4 mt-2 flex items-center justify-center gap-2 rounded-2xl bg-[var(--primary)] px-3 py-2.5 text-[13px] font-medium text-white shadow-sm transition hover:bg-[var(--primary-dark)]"
          >
            <PenLine size={15} />
            新建学习会话
          </button>
        ) : (
          <Link
            href="/chat"
            onClick={closeAfterNavigation}
            className="mx-4 mt-2 flex items-center justify-center gap-2 rounded-2xl bg-[var(--primary)] px-3 py-2.5 text-[13px] font-medium text-white shadow-sm transition hover:bg-[var(--primary-dark)]"
          >
            <PenLine size={15} />
            向导师提问
          </Link>
        )}

        <nav className="mt-5 space-y-1 px-3">
          {primaryNav.map((item) => {
            const active =
              !historyActive &&
              (pathname === item.href ||
                (item.href !== "/today" && pathname.startsWith(`${item.href}/`)) ||
                (item.href === "/today" &&
                  ["/diagnostic", "/learn", "/feedback"].some((prefix) =>
                    pathname.startsWith(prefix),
                  )));
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={closeAfterNavigation}
                className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-[13px] transition ${
                  active
                    ? "bg-[var(--card-solid)] text-[var(--foreground)] shadow-sm"
                    : "text-[var(--muted-foreground)] hover:bg-[var(--card-solid)] hover:text-[var(--foreground)]"
                }`}
              >
                <item.icon size={16} strokeWidth={active ? 2 : 1.7} />
                {item.label}
              </Link>
            );
          })}

          {onShowHistory ? (
            <button
              type="button"
              onClick={() => {
                onShowHistory();
                onClose?.();
              }}
              className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left text-[13px] transition ${
                historyActive
                  ? "bg-[var(--card-solid)] text-[var(--foreground)] shadow-sm"
                  : "text-[var(--muted-foreground)] hover:bg-[var(--card-solid)] hover:text-[var(--foreground)]"
              }`}
            >
              <History size={16} strokeWidth={historyActive ? 2 : 1.7} />
              历史会话
            </button>
          ) : null}
        </nav>

        <div className="mt-6 px-4">
          <div className="mb-2 text-[11px] font-medium text-[var(--muted-foreground)]">
            快速进入
          </div>
          <div className="space-y-1">
            {capabilityNav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={closeAfterNavigation}
                className="flex items-center gap-2 rounded-xl px-2 py-2 text-[12px] text-[var(--muted-foreground)] transition hover:bg-[var(--card-solid)] hover:text-[var(--foreground)]"
              >
                <item.icon size={14} />
                {item.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="mt-auto border-t border-[var(--border)] px-4 py-4">
          <div className="flex items-center gap-2 text-[11px] text-[var(--muted-foreground)]">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            {knowledgeCount === null || knowledgeCount === undefined
              ? "课程知识库"
              : `课程知识库 · ${knowledgeCount} 份文档`}
          </div>
        </div>
      </aside>
    </>
  );
}
