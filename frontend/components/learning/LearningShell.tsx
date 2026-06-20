"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu } from "lucide-react";
import { BrandMark } from "@/components/brand/BrandMark";
import { SettingsButton } from "@/components/settings/SettingsButton";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { AppSidebar } from "@/components/layout/AppSidebar";

export function LearningShell({
  children,
  fullWidth = false,
}: {
  children: React.ReactNode;
  fullWidth?: boolean;
}) {
  const [navOpen, setNavOpen] = useState(false);
  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <AppSidebar open={navOpen} onClose={() => setNavOpen(false)} />
      <div className="lg:pl-[248px]">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-[var(--border)] bg-[var(--surface)]/92 px-4 backdrop-blur-2xl md:px-6">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setNavOpen(true)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-[var(--muted)] lg:hidden"
              aria-label="打开菜单"
            >
              <Menu size={18} />
            </button>
            <Link href="/today" className="flex items-center gap-2 text-[15px] font-semibold">
              <BrandMark variant="logo" size={28} className="rounded-lg lg:hidden" />
              <span>ZhiPath</span>
            </Link>
          </div>
          <div className="flex items-center gap-1.5">
            <SettingsButton />
            <ThemeToggle compact />
          </div>
        </header>
        <main
          className={`w-full ${
            fullWidth
              ? ""
              : "mx-auto max-w-[1180px] px-4 py-4 md:px-6 md:py-5"
          }`}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
