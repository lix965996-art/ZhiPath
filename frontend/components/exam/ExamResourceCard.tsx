"use client";

import { CheckCircle2, Download, ExternalLink, FileText, Printer } from "lucide-react";
import { apiUrl, type ExamData } from "@/lib/api";

interface ExamResourceCardProps {
  exam: ExamData;
}

export function ExamResourceCard({ exam }: ExamResourceCardProps) {
  const docxUrl = apiUrl(`/api/v1/exams/${exam.id}/docx?include_answers=false`);
  const answerDocxUrl = apiUrl(`/api/v1/exams/${exam.id}/docx?include_answers=true`);
  const printUrl = apiUrl(`/api/v1/exams/${exam.id}/print?include_answers=true`);

  const counts = exam.questions.reduce<Record<string, number>>((acc, question) => {
    acc[question.section] = (acc[question.section] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="mb-5 ml-11 max-w-[720px] rounded-[24px] border border-[rgba(0,122,255,0.2)] bg-white/95 p-4 shadow-[var(--shadow-soft)]">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[rgba(0,122,255,0.1)] text-[var(--primary)]">
          <FileText size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-[rgba(52,199,89,0.12)] px-2 py-0.5 text-[11px] font-medium text-emerald-700">
            <CheckCircle2 size={12} />
            已生成可交付试卷
          </div>
          <div className="text-[14px] font-semibold text-[var(--foreground)]">
            {exam.title}
          </div>
          <div className="mt-1 text-[12px] leading-5 text-[var(--muted-foreground)]">
            {exam.subject} · {exam.topic} · {exam.questions.length} 题 · {exam.total_score} 分 · {exam.duration_minutes} 分钟
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-4">
        {["结构化题库", "正式 Word", "答案解析", "打印 PDF"].map((item) => (
          <div
            key={item}
            className="flex items-center gap-1.5 rounded-2xl border border-[var(--border)] bg-white px-2.5 py-2 text-[11px] text-[var(--foreground)]"
          >
            <CheckCircle2 size={13} className="text-[var(--primary)]" />
            {item}
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {Object.entries(counts).map(([section, count]) => (
          <div
            key={section}
            className="rounded-2xl bg-[var(--muted)] px-3 py-2 text-[12px] text-[var(--muted-foreground)]"
          >
            <span className="font-medium text-[var(--foreground)]">{section}</span>
            <span className="ml-2">{count} 题</span>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <a
          href={docxUrl}
          className="inline-flex items-center gap-1.5 rounded-full bg-[var(--primary)] px-3 py-2 text-[12px] font-medium text-white transition hover:bg-[var(--primary-dark)]"
        >
          <Download size={14} />
          下载试卷 Word
        </a>
        <a
          href={answerDocxUrl}
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-white px-3 py-2 text-[12px] font-medium text-[var(--foreground)] transition hover:bg-[var(--muted)]"
        >
          <Download size={14} />
          含答案解析
        </a>
        <a
          href={printUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-white px-3 py-2 text-[12px] font-medium text-[var(--foreground)] transition hover:bg-[var(--muted)]"
        >
          <Printer size={14} />
          打印 / PDF
        </a>
      </div>

      <div className="mt-3 flex items-center gap-1.5 text-[11px] text-[var(--muted-foreground)]">
        <ExternalLink size={12} />
        这是后端保存的结构化试卷资源，可复用、可下载、可打印。
      </div>
    </div>
  );
}
