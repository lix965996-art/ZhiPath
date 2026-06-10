"use client";

import { useCallback, useState } from "react";
import { motion } from "framer-motion";
import {
  Atom,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Loader2,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { BrandMark } from "@/components/brand/BrandMark";
import { QuizCard } from "@/components/quiz/QuizCard";
import { QuizFeedback } from "@/components/quiz/QuizFeedback";
import { MessageFeedback } from "@/components/chat/MessageFeedback";
import type { QuizData, QuizSubmitResult, QuizQuestion } from "@/lib/api";

interface MessageBubbleProps {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
  thinking?: string[];
  quizData?: QuizData | null;
  quizResult?: QuizSubmitResult | null;
  onQuizSubmit?: (answers: { question_index: number; answer: number | boolean | string | number[] }[]) => void;
  sessionId?: string;
  capability?: string;
}

function CodeBlock({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const code = String(children).replace(/\n$/, "");
  const language = className?.replace("language-", "") || "text";

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  }, [code]);

  return (
    <div className="group relative my-3">
      <div className="flex items-center justify-between rounded-t-2xl border border-b-0 border-[var(--border)] bg-[var(--muted)] px-3 py-1.5">
        <span className="text-[11px] text-[var(--muted-foreground)]">
          {language}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 rounded px-2 py-0.5 text-[11px] text-[var(--muted-foreground)] transition hover:bg-white hover:text-[var(--foreground)]"
        >
          {copied ? (
            <>
              <Check size={12} /> 已复制
            </>
          ) : (
            <>
              <Copy size={12} /> 复制
            </>
          )}
        </button>
      </div>
      <pre className="overflow-x-auto rounded-b-2xl border border-[var(--border)] bg-[#111318] p-3 text-[#f5f5f7]">
        <code className={className}>{code}</code>
      </pre>
    </div>
  );
}

const markdownComponents: Components = {
  code({ className, children, ...props }) {
    if (!className) {
      return (
        <code
          className="rounded bg-[var(--muted)] px-1.5 py-0.5 text-[13px]"
          {...props}
        >
          {children}
        </code>
      );
    }
    return <CodeBlock className={className}>{children}</CodeBlock>;
  },
};

function EngineeringTrace({
  items,
  isStreaming,
}: {
  items: string[];
  isStreaming?: boolean;
}) {
  const [open, setOpen] = useState(true);
  const displayItems = items.length
    ? items
    : isStreaming
      ? [
          "任务识别：正在理解你的学习目标和约束",
          "学情画像：正在读取本轮对话和已有画像",
          "依据来源：正在组织知识库与上下文",
        ]
      : [];

  if (!displayItems.length) return null;

  return (
    <div className="mb-3 overflow-hidden rounded-[24px] border border-[var(--border)] bg-white/80 text-[var(--foreground)] shadow-[var(--shadow-soft)] backdrop-blur-xl">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2">
          <span className="relative flex h-7 w-7 items-center justify-center rounded-xl bg-[rgba(0,122,255,0.12)] text-[var(--primary)]">
            <Atom size={16} className={isStreaming ? "lf-thinking-orbit" : ""} />
          </span>
          <span>
            <span className="block text-[14px] font-semibold">
              {isStreaming ? "正在深度思考" : "思考过程"}
            </span>
            <span className="mt-0.5 block text-[11px] font-normal text-[var(--muted-foreground)]">
              分析目标、画像、知识依据和输出结构
            </span>
          </span>
        </span>
        <span className="flex items-center gap-2 rounded-full bg-[var(--muted)] px-2.5 py-1 text-[11px] font-normal text-[var(--muted-foreground)]">
          {displayItems.length} 条
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      </button>
      {open && (
        <div className="border-t border-[var(--border)] bg-[rgba(242,242,247,0.62)] px-4 py-3">
          {displayItems.map((item, index) => (
            <TraceRow key={`${item}-${index}`} item={item} isActive={isStreaming && index === displayItems.length - 1} />
          ))}
        </div>
      )}
    </div>
  );
}

function TraceRow({ item, isActive }: { item: string; isActive?: boolean }) {
  const [label, detail] = splitTraceItem(item);

  return (
    <div className="relative grid gap-2 pb-3 pl-5 text-[13px] leading-6 last:pb-0 sm:grid-cols-[96px_minmax(0,1fr)]">
      <span
        className={`absolute left-0 top-2 h-2 w-2 rounded-full ${
          isActive ? "bg-[var(--primary)] shadow-[0_0_0_5px_rgba(0,122,255,0.14)]" : "bg-[rgba(60,60,67,0.24)]"
        }`}
      />
      <span className="font-medium text-[var(--primary)]">{label}</span>
      <span className="text-[var(--muted-foreground)]">{detail}</span>
    </div>
  );
}

function splitTraceItem(item: string): [string, string] {
  const index = item.indexOf("：");
  if (index < 0) return ["诊断", item];
  return [item.slice(0, index), item.slice(index + 1)];
}

export function MessageBubble({
  role,
  content,
  isStreaming,
  thinking = [],
  quizData,
  quizResult,
  onQuizSubmit,
  sessionId,
  capability,
}: MessageBubbleProps) {
  const isUser = role === "user";

  // Flatten quiz questions for QuizCard
  const quizQuestions: QuizQuestion[] = quizData
    ? [
        ...(quizData.single_choice_questions || []),
        ...(quizData.multiple_choice_questions || []),
        ...(quizData.true_false_questions || []),
        ...(quizData.short_answer_questions || []),
      ]
    : [];

  // Build results array for QuizCard from quizResult
  const quizResults = quizResult
    ? Array.from({ length: quizQuestions.length }, (_, i) => ({
        correct: i < quizResult.correct,
        explanation: undefined as string | undefined,
      }))
    : undefined;
  const shouldShowResponseBubble =
    isUser ||
    Boolean(content) ||
    (!isStreaming && !thinking.length && !quizQuestions.length);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.995 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
      className={`mb-5 flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}
    >
      {!isUser && (
        <BrandMark variant="assistant" size={32} className="mt-1" />
      )}

      <div className="max-w-[min(720px,86%)]">
        {!isUser && <EngineeringTrace items={thinking} isStreaming={isStreaming} />}

        {!isUser && quizQuestions.length > 0 && onQuizSubmit && (
          <div className="mb-3">
            <QuizCard
              questions={quizQuestions}
              onSubmit={onQuizSubmit}
              results={quizResults}
              disabled={!!quizResult}
            />
            {quizResult && <QuizFeedback result={quizResult} />}
          </div>
        )}

        {shouldShowResponseBubble && (
          <div
            className={`rounded-[22px] px-4 py-3 text-[14px] leading-6 shadow-sm ${
              isUser
                ? "bg-[var(--primary)] text-white"
                : "border border-[var(--border)] bg-white/85 text-[var(--foreground)]"
            }`}
          >
            {isUser ? (
              <div className="whitespace-pre-wrap">{content}</div>
            ) : (
              <div className="zhipath-prose">
                {content ? (
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={markdownComponents}
                  >
                    {content}
                  </ReactMarkdown>
                ) : (
                  <ThinkingPlaceholder />
                )}
                {isStreaming && content && (
                  <span className="mt-2 inline-flex items-center gap-1.5 text-[12px] text-[var(--muted-foreground)]">
                    <Loader2 size={12} className="animate-spin" />
                    生成中
                  </span>
                )}
                {!isStreaming && content && sessionId ? (
                  <MessageFeedback
                    sessionId={sessionId}
                    capability={capability}
                  />
                ) : null}
              </div>
            )}
          </div>
        )}
      </div>

      {isUser && (
        <BrandMark variant="user" size={32} className="mt-1" />
      )}
    </motion.div>
  );
}

function ThinkingPlaceholder() {
  return (
    <div className="flex items-center gap-2 text-[var(--muted-foreground)]">
      <BrandMark variant="input" size={28} className="lf-thinking-pulse rounded-xl" />
      <span>正在组织回答...</span>
    </div>
  );
}
