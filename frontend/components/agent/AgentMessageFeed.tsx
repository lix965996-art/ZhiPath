"use client";

import { useMemo } from "react";
import { useChat, type AgentEdgeMessage } from "@/context/ChatContext";

/**
 * 多智能体真实通信轨迹：把后端 emit 的 AGENT_MESSAGE 事件按时间顺序展示，
 * 每条是「from → to: label」+ payload 预览。配合 AgentWorkflowGraph 一起使用，
 * 评委可以直观看到智能体在协作交换什么数据。
 */
export function AgentMessageFeed({ compact = false }: { compact?: boolean }) {
  const { state } = useChat();
  const recent = useMemo(
    () => [...state.agentEdges].slice(-12).reverse(),
    [state.agentEdges],
  );

  return (
    <section
      className={`rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm ${
        compact ? "" : "lf-lift"
      }`}
    >
      <header className="mb-2 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-[var(--foreground)]">🔗 多智能体通信轨迹</h3>
          <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
            Agent → Agent 实时消息流（{state.agentEdges.length} 条）
          </p>
        </div>
        {state.isStreaming ? (
          <span className="rounded-full bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:text-blue-400">
            链路活跃
          </span>
        ) : null}
      </header>

      {recent.length === 0 ? (
        <p className="py-6 text-center text-xs text-[var(--muted-foreground)]">
          智能体之间一旦开始通信，会在此处实时长出气泡。
        </p>
      ) : (
        <ul className="space-y-1.5">
          {recent.map((edge) => (
            <EdgeRow key={edge.id} edge={edge} />
          ))}
        </ul>
      )}
    </section>
  );
}

function EdgeRow({ edge }: { edge: AgentEdgeMessage }) {
  const ageMs = Date.now() - edge.timestamp;
  const fresh = ageMs < 4000;
  const preview = previewPayload(edge.payload);
  return (
    <li
      className={`rounded-xl border px-3 py-2 text-xs transition ${
        fresh
          ? "border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20 shadow-sm"
          : "border-[var(--border)] bg-[var(--muted)]"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="font-semibold text-[var(--foreground)]">{edge.from}</span>
        <span className="text-[var(--muted-foreground)]">→</span>
        <span className="font-semibold text-[var(--foreground)]">{edge.to}</span>
        {edge.label ? (
          <span className="ml-auto rounded-full bg-[var(--card-solid)] px-2 py-0.5 text-[10px] text-[var(--foreground)]">
            {edge.label}
          </span>
        ) : null}
      </div>
      {preview ? (
        <p className="mt-1 font-mono text-[11px] leading-snug text-[var(--muted-foreground)]">
          {preview}
        </p>
      ) : null}
    </li>
  );
}

function previewPayload(payload: unknown): string {
  if (payload == null) return "";
  if (typeof payload === "string") return truncate(payload, 140);
  try {
    return truncate(JSON.stringify(payload), 140);
  } catch {
    return "";
  }
}

function truncate(text: string, n: number): string {
  return text.length <= n ? text : `${text.slice(0, n - 1)}…`;
}
