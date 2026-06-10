"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Database,
  Loader2,
  Search,
  Sparkles,
  Wand2,
} from "lucide-react";
import {
  getSemanticMap,
  listKnowledgeDocuments,
  projectQuery,
  searchKnowledge,
  type KnowledgeDocumentSummary,
  type KnowledgeSearchResult,
  type QueryProjection,
  type SemanticMap,
} from "@/lib/api";
import { KnowledgeNebula } from "./KnowledgeNebula";

/**
 * 知识库 · 星云可视化版
 *
 * 主视觉 = SVG 力导向知识星云 (真 embedding 相似度边).
 * 搜索时, 命中的文档节点高亮 + 涟漪, 未命中节点褪色, 同时右侧弹搜索结果。
 */
export function KnowledgeBasePanel() {
  const [map, setMap] = useState<SemanticMap | null>(null);
  const [projection, setProjection] = useState<QueryProjection | null>(null);
  const [documents, setDocuments] = useState<KnowledgeDocumentSummary[]>([]);
  const [results, setResults] = useState<KnowledgeSearchResult[]>([]);
  const [query, setQuery] = useState("");
  const [lastQuery, setLastQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [loadingTopology, setLoadingTopology] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getSemanticMap().catch(() => null),
      listKnowledgeDocuments().catch(() => []),
    ]).then(([m, docs]) => {
      if (cancelled) return;
      setMap(m);
      setDocuments(docs);
      setLoadingTopology(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSearch = async (e?: FormEvent) => {
    e?.preventDefault();
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setError("");
    setProjection(null);
    try {
      // 并行: 召回结果 (右栏) + 语义投影 (查询星落点)
      const [r, proj] = await Promise.all([
        searchKnowledge(q, 5),
        projectQuery(q, 5).catch(() => null),
      ]);
      setResults(r);
      setProjection(proj);
      setLastQuery(q);
    } catch {
      setError("检索失败, 请稍后重试");
    } finally {
      setSearching(false);
    }
  };

  const clearSearch = () => {
    setResults([]);
    setProjection(null);
    setLastQuery("");
    setQuery("");
    inputRef.current?.focus();
  };

  const stats = useMemo(() => {
    if (!map) return null;
    return {
      docCount: map.nodes.length,
      edgeCount: map.edges.length,
      embeddingDim: map.embedding_dim,
      retrieval: map.retrieval,
      totalChunks: map.nodes.reduce((s, n) => s + n.chunk_count, 0),
    };
  }, [map]);

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--surface)] backdrop-blur-2xl">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between gap-3 px-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/chat"
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-[12px] text-[var(--foreground)] hover:bg-[var(--muted)]"
            >
              <ArrowLeft size={13} />
              返回工作台
            </Link>
            <div className="hidden h-4 w-px bg-[var(--border)] sm:block" />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-[14.5px] font-semibold">
                <Database size={14} className="text-[var(--primary)]" />
                知识星云
              </div>
              <p className="text-[11px] text-[var(--muted-foreground)]">
                文档语义拓扑 · 实时 RAG 召回追溯
              </p>
            </div>
          </div>
          {stats ? <StatsBar stats={stats} /> : null}
        </div>
      </header>

      <div className="mx-auto grid max-w-[1400px] gap-4 px-4 pt-5 pb-12 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* 主视觉 · 知识星云 */}
        <section className="space-y-4">
          {/* 搜索框 */}
          <form
            onSubmit={handleSearch}
            className="flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 shadow-sm focus-within:border-[var(--primary)]/45 focus-within:shadow-[0_0_0_3px_rgba(124,58,237,0.10)]"
          >
            <Search size={15} className="shrink-0 text-[var(--muted-foreground)]" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="试试: 监督学习和无监督学习有什么区别 · 反向传播是怎么算的"
              className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-[var(--muted-foreground)]/65"
            />
            {results.length > 0 ? (
              <button
                type="button"
                onClick={clearSearch}
                className="rounded-full bg-[var(--muted)] px-2.5 py-1 text-[10.5px] text-[var(--muted-foreground)] hover:bg-[var(--border)]"
              >
                清除
              </button>
            ) : null}
            <button
              type="submit"
              disabled={searching || !query.trim()}
              className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#007AFF] to-[#7c3aed] px-3.5 py-1.5 text-[12px] font-medium text-white shadow-sm transition hover:opacity-92 disabled:opacity-50"
            >
              {searching ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Sparkles size={12} />
              )}
              {searching ? "检索中" : "语义检索"}
            </button>
          </form>

          {/* 语义空间星云 */}
          {loadingTopology ? (
            <div className="flex h-[560px] items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--card)]">
              <Loader2 size={20} className="animate-spin text-[var(--muted-foreground)]" />
            </div>
          ) : !map || map.nodes.length === 0 ? (
            <div className="flex h-[400px] items-center justify-center rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)] p-6 text-center">
              <div>
                <Wand2 size={20} className="mx-auto mb-2 text-[var(--muted-foreground)]" />
                <p className="text-[12.5px] text-[var(--muted-foreground)]">
                  知识库还是空的, 添加几篇文档后回来看语义星云。
                </p>
              </div>
            </div>
          ) : (
            <KnowledgeNebula map={map} projection={projection} query={lastQuery} />
          )}
        </section>

        {/* 右栏 · 搜索结果 / 文档清单 */}
        <aside className="min-w-0 space-y-3">
          {error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-[12px] text-red-700">
              {error}
            </div>
          ) : null}
          {results.length > 0 ? (
            <SearchResultsPanel results={results} query={query} />
          ) : (
            <DocumentRoster documents={documents} />
          )}
        </aside>
      </div>
    </main>
  );
}

// ===== 顶部统计条 =====

function StatsBar({
  stats,
}: {
  stats: {
    docCount: number;
    edgeCount: number;
    embeddingDim: number;
    retrieval: string;
    totalChunks: number;
  };
}) {
  return (
    <div className="hidden items-center gap-3 lg:flex">
      <StatChip label="文档" value={stats.docCount.toString()} />
      <StatChip label="切片" value={stats.totalChunks.toString()} />
      <StatChip label="向量边" value={stats.edgeCount.toString()} />
      <StatChip
        label="召回"
        value={
          stats.retrieval.startsWith("pgvector")
            ? `pgvector ${stats.embeddingDim}d`
            : "lexical"
        }
      />
    </div>
  );
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--card)] px-2.5 py-1 text-[11px]">
      <span className="text-[var(--muted-foreground)]">{label}</span>
      <span className="font-mono font-medium text-[var(--foreground)]">{value}</span>
    </span>
  );
}

// ===== 搜索结果 (右栏) =====

function SearchResultsPanel({
  results,
  query,
}: {
  results: KnowledgeSearchResult[];
  query: string;
}) {
  return (
    <section className="space-y-2.5">
      <header className="flex items-center justify-between px-1">
        <p className="text-[12.5px] font-semibold">
          召回 {results.length} 条
          <span className="ml-1.5 text-[11px] font-normal text-[var(--muted-foreground)]">
            · {truncate(query, 16)}
          </span>
        </p>
        <span className="rounded-full bg-[var(--primary)]/12 px-2 py-0.5 text-[10px] font-medium text-[var(--primary)]">
          {results[0]?.retrieval_mode || "pgvector"}
        </span>
      </header>
      <ol className="space-y-2">
        {results.map((r, i) => (
          <li
            key={`${r.document_id}-${i}`}
            className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3"
          >
            <header className="flex items-start justify-between gap-2">
              <p className="line-clamp-1 text-[12.5px] font-semibold">
                #{i + 1} {r.title}
              </p>
              <span
                className="shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px]"
                style={{
                  background: scoreBg(r.score),
                  color: scoreColor(r.score),
                }}
              >
                {(r.score * 100).toFixed(1)}%
              </span>
            </header>
            <p className="mt-1.5 line-clamp-4 text-[11.5px] leading-5 text-[var(--muted-foreground)]">
              {highlightQuery(r.content, query)}
            </p>
            {r.tags?.length ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {r.tags.slice(0, 3).map((t) => (
                  <span
                    key={t}
                    className="rounded-full bg-[var(--muted)] px-1.5 py-0.5 text-[9.5px] text-[var(--muted-foreground)]"
                  >
                    {t}
                  </span>
                ))}
              </div>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

function highlightQuery(content: string, _query: string): string {
  // 当前用 line-clamp 截断, 不做内联 highlight 避免 dangerouslySetInnerHTML.
  // 简单截前 240 字
  return content.length > 240 ? content.slice(0, 240) + "…" : content;
}

function scoreColor(s: number): string {
  if (s >= 0.7) return "#7c3aed";
  if (s >= 0.4) return "#0a84ff";
  return "#64748b";
}

function scoreBg(s: number): string {
  if (s >= 0.7) return "rgba(124,58,237,0.12)";
  if (s >= 0.4) return "rgba(10,132,255,0.12)";
  return "rgba(148,163,184,0.18)";
}

// ===== 默认右栏 · 文档清单 =====

function DocumentRoster({ documents }: { documents: KnowledgeDocumentSummary[] }) {
  return (
    <section className="space-y-2.5">
      <header className="flex items-center justify-between px-1">
        <p className="text-[12.5px] font-semibold">知识库 {documents.length} 份文档</p>
        <span className="text-[10.5px] text-[var(--muted-foreground)]">点节点查看</span>
      </header>
      {documents.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)] p-4 text-[12px] text-[var(--muted-foreground)]">
          尚无文档。
        </div>
      ) : (
        <ol className="max-h-[560px] overflow-y-auto space-y-1.5 pr-1">
          {documents.map((d) => (
            <li
              key={d.id}
              className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2"
            >
              <p className="line-clamp-1 text-[12px] font-medium">{d.title}</p>
              <div className="mt-0.5 flex items-center gap-2 text-[10.5px] text-[var(--muted-foreground)]">
                <span className="font-mono">{d.chunk_count} 切片</span>
                {d.tags?.length ? (
                  <>
                    <span>·</span>
                    <span className="line-clamp-1">{d.tags.slice(0, 2).join(" / ")}</span>
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function truncate(s: string, n: number): string {
  if (!s) return "";
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}
