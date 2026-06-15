"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  FileText,
  Loader2,
  MessageCircle,
  Route,
  Search,
  Sparkles,
} from "lucide-react";
import {
  getLearningHistory,
  getMastery,
  getSemanticMap,
  listSessions,
  searchKnowledge,
  type KnowledgeSearchResult,
  type LearningHistory,
  type MasterySnapshot,
  type SemanticMap,
  type SessionSummary,
} from "@/lib/api";
import {
  buildStarmap,
  matchKCs,
  SUBJECTS,
  type StarmapModel,
  type StarNode,
  type SubjectKey,
} from "./starmap-data";

const SUBJECT_META: Record<SubjectKey, { label: string; short: string; color: string }> = {
  ds: { label: "数据结构", short: "DS", color: "#007AFF" },
  co: { label: "计算机组成原理", short: "CO", color: "#5856D6" },
  os: { label: "操作系统", short: "OS", color: "#FF9500" },
  cn: { label: "计算机网络", short: "CN", color: "#34C759" },
};

const NODE_LABEL: Record<string, string> = {
  ds_linear: "线性表",
  ds_tree: "树与二叉树",
  ds_avl: "AVL 树",
  ds_graph: "图",
  ds_sort: "排序",
  ds_hash: "查找与哈希",
  co_data: "数据表示",
  co_cache: "Cache 映射",
  co_inst: "指令系统",
  co_cpu: "CPU 与流水线",
  co_mem: "主存储器",
  co_bus: "总线与 I/O",
  os_proc: "进程管理",
  os_sched: "处理机调度",
  os_deadlock: "死锁",
  os_mem: "内存管理",
  os_vm: "虚拟存储器",
  os_file: "文件管理",
  cn_phys: "物理层",
  cn_link: "数据链路层",
  cn_net: "网络层",
  cn_tcp: "运输层 TCP",
  cn_app: "应用层",
};

const ACTION_TEXT = {
  question: "生成 3 道题",
  path: "加入学习路径",
  explain: "解释当前考点",
};

export function KnowledgeBasePanel() {
  const router = useRouter();
  const [semanticMap, setSemanticMap] = useState<SemanticMap | null>(null);
  const [mastery, setMastery] = useState<MasterySnapshot | null>(null);
  const [learningHistory, setLearningHistory] = useState<LearningHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [lastQuery, setLastQuery] = useState("");
  const [results, setResults] = useState<KnowledgeSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [map, sessions, history] = await Promise.all([
        getSemanticMap().catch(() => null),
        listSessions(5).catch(() => [] as SessionSummary[]),
        getLearningHistory().catch(() => ({})),
      ]);
      let snapshot: MasterySnapshot | null = null;
      if (sessions.length) {
        snapshot = await getMastery(sessions[0].id).catch(() => null);
      }
      if (cancelled) return;
      setSemanticMap(map);
      setMastery(snapshot);
      setLearningHistory(history);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const model = useMemo(
    () => buildStarmap({ semanticMap, mastery, learningHistory }),
    [semanticMap, mastery, learningHistory],
  );

  const stats = useMemo(() => {
    const chunkCount = (semanticMap?.nodes ?? []).reduce((sum, node) => sum + node.chunk_count, 0);
    const docCount = semanticMap?.nodes.length ?? 0;
    return {
      concepts: model.total,
      chunks: chunkCount || docCount,
    };
  }, [model.total, semanticMap]);

  const selectedNode = useMemo(
    () => model.nodes.find((node) => node.id === selectedId) ?? null,
    [model.nodes, selectedId],
  );

  const queryHits = useMemo(
    () => matchKCs(lastQuery, model.nodes),
    [lastQuery, model.nodes],
  );

  const focus = useMemo(() => pickFocusNode(model, selectedNode, queryHits), [model, selectedNode, queryHits]);

  const handleSearch = async (event?: FormEvent) => {
    event?.preventDefault();
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setLastQuery(q);
    setSelectedId(null);
    try {
      const r = await searchKnowledge(q, 6);
      setResults(r);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const goChat = (prompt: string) => router.push(`/chat?p=${encodeURIComponent(prompt)}`);

  return (
    <main className="min-h-screen bg-[#f5f5f7] text-[#1d1d1f]">
      <header className="sticky top-0 z-30 border-b border-black/[0.06] bg-white/95">
        <div className="mx-auto flex h-[72px] max-w-[1280px] items-center justify-between gap-4 px-5">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/chat"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-black/[0.08] bg-white text-[#6e6e73] shadow-sm hover:text-[#1d1d1f]"
              title="返回工作台"
            >
              <ArrowLeft size={16} />
            </Link>
            <div className="min-w-0">
              <h1 className="truncate text-[19px] font-semibold tracking-tight">课程知识库</h1>
              <p className="mt-0.5 text-[12px] text-[#86868b]">408 · kb-final 真实来源</p>
            </div>
          </div>
          {!loading ? <HeaderStats stats={stats} /> : null}
        </div>
      </header>

      <div className="mx-auto grid max-w-[1280px] gap-5 px-5 py-6 lg:grid-cols-[minmax(0,1fr)_330px]">
        <section className="space-y-5">
          <form
            onSubmit={handleSearch}
            className="flex min-h-[56px] items-center gap-3 rounded-[18px] border border-black/[0.08] bg-white px-4 shadow-sm focus-within:border-black/20"
          >
            <Search size={18} className="shrink-0 text-[#86868b]" />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜一个 408 难点：死锁、Cache 映射、TCP 三次握手"
              className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-[#a1a1a6]"
            />
            {lastQuery ? (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setLastQuery("");
                  setResults([]);
                  inputRef.current?.focus();
                }}
                className="hidden rounded-full bg-[#f5f5f7] px-3 py-1.5 text-[12px] text-[#6e6e73] hover:bg-[#ececf0] sm:block"
              >
                清空
              </button>
            ) : null}
            <button
              type="submit"
              disabled={searching || !query.trim()}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#1d1d1f] px-4 py-2 text-[13px] font-medium text-white disabled:opacity-45"
            >
              {searching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
              检索
            </button>
          </form>

          {loading ? (
            <LoadingCard />
          ) : (
            <>
              <TodayCard
                focus={focus}
                assessed={model.mode === "real"}
                onContinue={() => router.push(`/resources?topic=${encodeURIComponent(displayNodeLabel(focus))}`)}
              />
              <SubjectDirectory
                model={model}
                selectedId={selectedId}
                onSelect={(node) => {
                  setSelectedId(node.id);
                  setResults([]);
                  setLastQuery("");
                }}
              />
              {results.length ? <SearchResults results={results} query={lastQuery} /> : null}
            </>
          )}
        </section>

        {!loading ? (
          <aside className="space-y-5 lg:sticky lg:top-[96px] lg:self-start">
            <NextActionCard
              focus={focus}
              assessed={model.mode === "real"}
              weakNodes={pickWeakNodes(model)}
              onGenerate={() => router.push(`/resources?topic=${encodeURIComponent(displayNodeLabel(focus))}`)}
              onPath={() => router.push("/path")}
              onExplain={() => goChat(`请按 408 考研口径解释「${displayNodeLabel(focus)}」，先讲核心概念，再给我一道对应练习。`)}
              onSelect={setSelectedId}
            />
          </aside>
        ) : null}
      </div>
    </main>
  );
}

function HeaderStats({ stats }: { stats: { concepts: number; chunks: number } }) {
  return (
    <div className="hidden items-center gap-2 sm:flex">
      <StatPill label="考点" value={stats.concepts} />
      <StatPill label="真实切片" value={stats.chunks} />
    </div>
  );
}

function StatPill({ label, value }: { label: string; value: number }) {
  return (
    <span className="rounded-full border border-black/[0.08] bg-white px-3 py-1.5 text-[12px] text-[#6e6e73] shadow-sm">
      <span className="font-mono text-[#1d1d1f]">{value}</span> {label}
    </span>
  );
}

function TodayCard({
  focus,
  assessed,
  onContinue,
}: {
  focus: StarNode;
  assessed: boolean;
  onContinue: () => void;
}) {
  const meta = SUBJECT_META[focus.subject];
  const label = displayNodeLabel(focus);
  const value = assessed ? Math.round(focus.mastery * 100) : coveragePercent(focus);
  const subtitle = assessed
    ? `当前掌握 ${Math.round(focus.mastery * 100)}% · ${focus.corpusCount} 片来源`
    : `${focus.corpusCount} 片来源 · 待测掌握度`;

  return (
    <section className="rounded-[24px] border border-black/[0.08] bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[13px] font-medium text-[#86868b]">今天先补这个</p>
          <div className="mt-3 flex items-center gap-2">
            <span
              className="rounded-full px-2.5 py-1 text-[12px] font-medium"
              style={{ color: meta.color, background: `${meta.color}14` }}
            >
              {meta.label}
            </span>
            <span className="text-[12px] text-[#86868b]">{meta.short}</span>
          </div>
          <h2 className="mt-4 text-[34px] font-semibold tracking-tight">{label}</h2>
          <p className="mt-2 text-[14px] text-[#6e6e73]">{subtitle}</p>
        </div>
        <button
          type="button"
          onClick={onContinue}
          className="rounded-full bg-[#1d1d1f] px-4 py-2 text-[13px] font-medium text-white hover:opacity-90"
        >
          继续学习
        </button>
      </div>

      <div className="mt-7 h-3 overflow-hidden rounded-full bg-[#f0f0f3]">
        <div
          className="h-full rounded-full bg-[linear-gradient(90deg,#35c8c2_0%,#56d364_38%,#ffb15c_100%)]"
          style={{ width: `${Math.max(8, Math.min(100, value))}%` }}
        />
      </div>
      <p className="mt-4 text-[14px] text-[#515154]">{focusTip(label)}</p>
    </section>
  );
}

function SubjectDirectory({
  model,
  selectedId,
  onSelect,
}: {
  model: StarmapModel;
  selectedId: string | null;
  onSelect: (node: StarNode) => void;
}) {
  const rows = SUBJECTS.map((subject) => {
    const nodes = model.nodes
      .filter((node) => node.subject === subject.key)
      .sort((a, b) => b.corpusCount - a.corpusCount)
      .slice(0, 3);
    const count = model.nodes
      .filter((node) => node.subject === subject.key)
      .reduce((sum, node) => sum + node.corpusCount, 0);
    return { subject: subject.key, nodes, count };
  });

  return (
    <section>
      <div className="mb-3 flex items-end justify-between">
        <div>
          <h2 className="text-[20px] font-semibold tracking-tight">408 四科目录</h2>
          <p className="mt-1 text-[12px] text-[#86868b]">按课程入口组织，只露出当前最值得看的考点。</p>
        </div>
      </div>
      <div className="space-y-3">
        {rows.map((row) => {
          const meta = SUBJECT_META[row.subject];
          return (
            <section
              key={row.subject}
              className="rounded-[18px] border border-black/[0.08] bg-white p-4 shadow-sm"
            >
              <div className="flex items-center gap-4">
                <div className="flex min-w-[150px] items-center gap-3">
                  <span className="h-9 w-1 rounded-full" style={{ background: meta.color }} />
                  <div>
                    <h3 className="text-[15px] font-semibold">{meta.label}</h3>
                    <p className="mt-0.5 text-[12px] text-[#86868b]">{row.count} 片</p>
                  </div>
                </div>
                <div className="flex min-w-0 flex-1 flex-wrap gap-2">
                  {row.nodes.map((node) => {
                    const active = selectedId === node.id;
                    return (
                      <button
                        key={node.id}
                        type="button"
                        onClick={() => onSelect(node)}
                        className={`rounded-full border px-3 py-1.5 text-[12px] transition ${
                          active
                            ? "border-[#1d1d1f] bg-[#1d1d1f] text-white"
                            : "border-black/[0.08] bg-[#f8f8fa] text-[#515154] hover:border-black/20"
                        }`}
                      >
                        {displayNodeLabel(node)}
                        <span className={active ? "ml-1 text-white/70" : "ml-1 text-[#86868b]"}>
                          {node.corpusCount}片
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}

function NextActionCard({
  focus,
  assessed,
  weakNodes,
  onGenerate,
  onPath,
  onExplain,
  onSelect,
}: {
  focus: StarNode;
  assessed: boolean;
  weakNodes: StarNode[];
  onGenerate: () => void;
  onPath: () => void;
  onExplain: () => void;
  onSelect: (id: string) => void;
}) {
  return (
    <section className="rounded-[24px] border border-black/[0.08] bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="text-[20px] font-semibold tracking-tight">下一步</h2>
        <p className="mt-1 text-[12px] text-[#86868b]">别在知识库里聊天，直接做动作。</p>
      </div>
      <div className="space-y-2">
        <ActionButton icon={<FileText size={15} />} label={ACTION_TEXT.question} onClick={onGenerate} />
        <ActionButton icon={<Route size={15} />} label={ACTION_TEXT.path} onClick={onPath} />
        <ActionButton icon={<MessageCircle size={15} />} label={ACTION_TEXT.explain} onClick={onExplain} />
      </div>

      <div className="my-5 h-px bg-black/[0.06]" />

      <div>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[13px] font-semibold">{assessed ? "薄弱 TOP 3" : "高频 TOP 3"}</p>
          <span className="text-[11px] text-[#86868b]">{displayNodeLabel(focus)}</span>
        </div>
        <div className="space-y-3">
          {weakNodes.map((node) => (
            <button
              key={node.id}
              type="button"
              onClick={() => onSelect(node.id)}
              className="block w-full text-left"
            >
              <div className="mb-1 flex items-center justify-between gap-3">
                <span className="truncate text-[13px] text-[#1d1d1f]">{displayNodeLabel(node)}</span>
                <span className="font-mono text-[12px] text-[#ff5f7e]">
                  {assessed ? `${Math.round(node.mastery * 100)}%` : `${node.corpusCount}片`}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-[#f0f0f3]">
                <div
                  className="h-full rounded-full bg-[#ff5f7e]"
                  style={{ width: `${assessed ? Math.max(4, Math.round(node.mastery * 100)) : Math.min(100, Math.max(8, node.corpusCount * 5))}%` }}
                />
              </div>
            </button>
          ))}
        </div>
      </div>

      <p className="mt-5 rounded-[14px] bg-[#f5f5f7] px-3 py-2 text-[12px] leading-5 text-[#6e6e73]">
        动作会进入资源工坊或导师对话。知识库只负责定位和追溯。
      </p>
    </section>
  );
}

function ActionButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-[15px] border border-black/[0.08] bg-white px-3.5 py-3 text-left text-[14px] font-medium hover:bg-[#f8f8fa]"
    >
      <span className="flex items-center gap-2.5">
        <span className="text-[#86868b]">{icon}</span>
        {label}
      </span>
      <ArrowRight size={15} className="text-[#86868b]" />
    </button>
  );
}

function SearchResults({ results, query }: { results: KnowledgeSearchResult[]; query: string }) {
  return (
    <section className="rounded-[24px] border border-black/[0.08] bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-[18px] font-semibold tracking-tight">检索结果</h2>
          <p className="mt-1 text-[12px] text-[#86868b]">{query} · 命中 {results.length} 条来源</p>
        </div>
      </div>
      <div className="space-y-2">
        {results.map((result, index) => (
          <article
            key={`${result.document_id}-${index}`}
            className="rounded-[16px] border border-black/[0.06] bg-[#fafafa] p-3"
          >
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <h3 className="truncate text-[13px] font-semibold">
                #{index + 1} {result.title}
              </h3>
              <span className="font-mono text-[11px] text-[#007AFF]">
                {(result.score * 100).toFixed(1)}%
              </span>
            </div>
            <p className="line-clamp-2 text-[12px] leading-5 text-[#6e6e73]">
              {result.content}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

function LoadingCard() {
  return (
    <div className="flex h-[360px] items-center justify-center rounded-[24px] border border-black/[0.08] bg-white">
      <Loader2 size={22} className="animate-spin text-[#86868b]" />
    </div>
  );
}

function pickFocusNode(model: StarmapModel, selected: StarNode | null, queryHits: string[]) {
  if (selected) return selected;
  const queryHit = model.nodes.find((node) => node.id === queryHits[0]);
  if (queryHit) return queryHit;
  const candidates = [...model.nodes];
  if (model.mode === "real") {
    return candidates.sort((a, b) => a.mastery - b.mastery)[0] ?? candidates[0];
  }
  return candidates.sort((a, b) => b.corpusCount - a.corpusCount)[0] ?? candidates[0];
}

function pickWeakNodes(model: StarmapModel) {
  const candidates = [...model.nodes];
  if (model.mode === "real") {
    return candidates.sort((a, b) => a.mastery - b.mastery).slice(0, 3);
  }
  return candidates.sort((a, b) => b.corpusCount - a.corpusCount).slice(0, 3);
}

function displayNodeLabel(node: StarNode) {
  return NODE_LABEL[node.id] || node.label;
}

function coveragePercent(node: StarNode) {
  return Math.max(8, Math.min(100, node.corpusCount * 2));
}

function focusTip(label: string) {
  if (label.includes("哈希") || label.includes("查找")) return "先弄清哈希冲突，再做查找效率题。";
  if (label.includes("Cache")) return "先拆地址字段，再判断映射方式和命中过程。";
  if (label.includes("死锁")) return "先背四个必要条件，再练银行家算法和资源分配图。";
  if (label.includes("TCP")) return "先画状态变化，再区分三次握手和四次挥手。";
  return "先抓定义边界，再用一道题验证。";
}
