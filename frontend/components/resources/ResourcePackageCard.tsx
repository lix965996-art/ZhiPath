"use client";

import Link from "next/link";
import { ArrowRight, Boxes, CheckCircle2, Download, Printer } from "lucide-react";
import { apiUrl, type LearningResourcePackage } from "@/lib/api";

interface ResourcePackageCardProps {
  compact?: boolean;
  pkg: LearningResourcePackage;
}

export function ResourcePackageCard({ compact = false, pkg }: ResourcePackageCardProps) {
  const examId = pkg.resources.exam?.id;
  const docxUrl = examId ? apiUrl(`/api/v1/exams/${examId}/docx?include_answers=false`) : "";
  const printUrl = examId ? apiUrl(`/api/v1/exams/${examId}/print?include_answers=true`) : "";

  return (
    <div className={`rounded-[24px] border border-[rgba(0,122,255,0.18)] bg-white/95 p-4 shadow-[var(--shadow-soft)] ${compact ? "mb-5 ml-11 max-w-[720px]" : ""}`}>
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[rgba(0,122,255,0.1)] text-[var(--primary)]">
          <Boxes size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-[rgba(52,199,89,0.12)] px-2 py-0.5 text-[11px] font-medium text-emerald-700">
            <CheckCircle2 size={12} />
            已沉淀为学习资源包
          </div>
          <div className="text-[14px] font-semibold text-[var(--foreground)]">
            {pkg.title}
          </div>
          <div className="mt-1 text-[12px] leading-5 text-[var(--muted-foreground)]">
            {pkg.topic} · {pkg.assets.length} 类资源 · {formatTime(pkg.created_at)}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {pkg.assets.map((asset) => (
          <div
            key={`${asset.type}-${asset.label}`}
            className="group relative overflow-hidden rounded-2xl bg-[var(--muted)] px-3 py-2 text-[12px] text-[var(--muted-foreground)] transition hover:bg-white hover:shadow-sm"
          >
            <span className="lf-resource-sweep absolute inset-y-0 left-[-35%] w-[32%] bg-white/55 opacity-0 blur-md transition group-hover:opacity-100" />
            <span className="font-medium text-[var(--foreground)]">{asset.label}</span>
            {asset.count ? <span className="ml-2">{asset.count} 项</span> : null}
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href="/resources"
          className="inline-flex items-center gap-1.5 rounded-full bg-[var(--primary)] px-3 py-2 text-[12px] font-medium text-white transition hover:bg-[var(--primary-dark)]"
        >
          查看资源包
          <ArrowRight size={14} />
        </Link>
        {examId && (
          <>
            <a
              href={docxUrl}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-white px-3 py-2 text-[12px] font-medium text-[var(--foreground)] transition hover:bg-[var(--muted)]"
            >
              <Download size={14} />
              试卷 Word
            </a>
            <a
              href={printUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-white px-3 py-2 text-[12px] font-medium text-[var(--foreground)] transition hover:bg-[var(--muted)]"
            >
              <Printer size={14} />
              打印 PDF
            </a>
          </>
        )}
      </div>
    </div>
  );
}

function formatTime(value: string) {
  if (!value) return "刚刚生成";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "刚刚生成";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
