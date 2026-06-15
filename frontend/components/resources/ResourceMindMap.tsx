"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { BookOpen, CheckCircle2, ChevronRight, HelpCircle, Layers3 } from "lucide-react";
import type { LearningResourcePackage } from "@/lib/api";

interface MapNode {
  id: string;
  label: string;
  children: string[];
}

export function ResourceMindMap({ pkg }: { pkg: LearningResourcePackage }) {
  const nodes = useMemo(() => buildNodes(pkg), [pkg]);
  const [selectedId, setSelectedId] = useState(nodes[1]?.id || nodes[0]?.id || "");
  const selected = nodes.find((node) => node.id === selectedId) || nodes[1] || nodes[0];
  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const relatedLabels = useMemo(
    () => buildRelatedLabels(selected, nodes, nodeById),
    [selected, nodes, nodeById],
  );

  useEffect(() => {
    if (nodes.length && !nodes.some((node) => node.id === selectedId)) {
      setSelectedId(nodes[1]?.id || nodes[0]?.id || "");
    }
  }, [nodes, selectedId]);

  if (!selected) return null;

  const visibleNodes = nodes.filter((node) => node.id !== "root");

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--card-solid)] shadow-[var(--shadow-soft)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
        <div>
          <h2 className="text-[18px] font-bold tracking-tight">知识结构</h2>
          <p className="mt-1 text-[12px] text-[var(--muted-foreground)]">
            按 408 考点拆成可复习的目录，点一个节点直接看重点。
          </p>
        </div>
        <span className="rounded-full bg-[var(--muted)] px-3 py-1 text-[12px] font-medium text-[var(--muted-foreground)]">
          {visibleNodes.length || nodes.length} 个考点
        </span>
      </div>

      <div className="grid min-h-[560px] gap-0 lg:grid-cols-[300px_minmax(0,1fr)]">
        <nav className="border-b border-[var(--border)] p-4 lg:border-b-0 lg:border-r">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[12px] font-semibold text-[var(--muted-foreground)]">考点目录</p>
            <p className="text-[12px] text-[var(--muted-foreground)]">{pkg.topic || "408"}</p>
          </div>
          <div className="max-h-[500px] space-y-1 overflow-auto pr-1">
            {(visibleNodes.length ? visibleNodes : nodes).map((node, index) => {
              const active = node.id === selected.id;
              return (
                <button
                  key={node.id}
                  type="button"
                  onClick={() => setSelectedId(node.id)}
                  className={`group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition ${
                    active
                      ? "bg-[var(--foreground)] text-[var(--background)]"
                      : "text-[var(--foreground)] hover:bg-[var(--muted)]"
                  }`}
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold ${
                      active
                        ? "bg-[var(--background)]/14 text-[var(--background)]"
                        : "bg-[var(--muted)] text-[var(--muted-foreground)]"
                    }`}
                  >
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold">{node.label}</span>
                    <span
                      className={`mt-0.5 block text-[11px] ${
                        active ? "text-[var(--background)]/70" : "text-[var(--muted-foreground)]"
                      }`}
                    >
                      {node.children.length ? `${node.children.length} 个下级点` : "独立考点"}
                    </span>
                  </span>
                  <ChevronRight size={14} className={active ? "opacity-80" : "opacity-40 group-hover:opacity-70"} />
                </button>
              );
            })}
          </div>
        </nav>

        <div className="p-5">
          <div className="mb-5">
            <p className="text-[12px] font-semibold text-[var(--muted-foreground)]">当前考点</p>
            <h3 className="mt-2 text-[28px] font-bold tracking-tight">{selected.label}</h3>
            <p className="mt-3 max-w-3xl text-[15px] leading-8 text-[var(--foreground)]/78">
              {buildNodeSummary(selected, pkg)}
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <StudyCard
              title="先抓什么"
              text={buildCoreFocus(selected.label)}
              icon={<CheckCircle2 size={15} />}
            />
            <StudyCard
              title="408 怎么考"
              text={buildExamHandle(selected.label)}
              icon={<HelpCircle size={15} />}
            />
            <StudyCard
              title="下一步"
              text={buildNextAction(selected.label)}
              icon={<Layers3 size={15} />}
            />
          </div>

          {relatedLabels.length ? (
            <div className="mt-6">
              <p className="mb-3 text-[12px] font-semibold text-[var(--muted-foreground)]">关联考点</p>
              <div className="flex flex-wrap gap-2">
                {relatedLabels.map((label) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => {
                      const target = nodes.find((node) => node.label === label);
                      if (target) setSelectedId(target.id);
                    }}
                    className="rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-[12px] font-medium text-[var(--foreground)]/82 hover:border-[var(--foreground)]"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-6 border-t border-[var(--border)] pt-5">
            <p className="mb-3 text-[12px] font-semibold text-[var(--muted-foreground)]">去对应资源继续学</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {resourceLinks(pkg).map((asset) => (
                <div
                  key={`${asset.type}-${asset.label}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-3"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <BookOpen size={14} className="shrink-0 text-[var(--muted-foreground)]" />
                    <span className="truncate text-[13px] font-semibold">{asset.label}</span>
                  </span>
                  <span className="text-[11px] text-[var(--muted-foreground)]">{asset.hint}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function StudyCard({
  title,
  text,
  icon,
}: {
  title: string;
  text: string;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="mb-3 flex items-center gap-2 text-[12px] font-semibold text-[var(--muted-foreground)]">
        {icon}
        <span>{title}</span>
      </div>
      <p className="text-[14px] leading-7 text-[var(--foreground)]/84">{text}</p>
    </div>
  );
}

function buildNodes(pkg: LearningResourcePackage): MapNode[] {
  const mindmapNodes = pkg.resources.mindmap?.nodes || [];
  const topic = pkg.topic || pkg.title || "408 核心考点";
  const usedIds = new Set<string>(["root"]);
  const normalized = mindmapNodes
    .slice(0, 20)
    .map((node, index) => {
      const rawId = String(node.id || `node-${index}`).trim();
      let id = rawId && rawId !== "root" ? rawId : `node-${index}`;
      if (usedIds.has(id)) id = `${id}-${index}`;
      usedIds.add(id);
      return {
        id,
        label: cleanLabel(node.label, `考点 ${index + 1}`),
        children: (node.children || []).filter(Boolean),
      };
    })
    .filter((node) => node.label.trim().length > 0);

  if (normalized.length > 0) {
    return [
      { id: "root", label: topic, children: normalized.slice(0, 12).map((node) => node.id) },
      ...normalized,
    ];
  }

  const assets = pkg.assets.slice(0, 10).map((asset, index) => ({
    id: `${asset.type || "asset"}-${index}`,
    label: cleanLabel(asset.label || asset.type, `资源 ${index + 1}`),
    children: [],
  }));
  return [
    { id: "root", label: topic, children: assets.map((asset) => asset.id) },
    ...assets,
  ];
}

function buildRelatedLabels(selected: MapNode, nodes: MapNode[], nodeById: Map<string, MapNode>) {
  const direct = selected.children
    .map((child) => nodeById.get(child)?.label || cleanLabel(child, ""))
    .filter((label) => label && !isInternalLabel(label));

  if (direct.length) return unique(direct).slice(0, 8);

  return nodes
    .filter((node) => node.id !== "root" && node.id !== selected.id)
    .map((node) => node.label)
    .filter((label) => !isInternalLabel(label))
    .slice(0, 6);
}

function buildNodeSummary(node: MapNode, pkg: LearningResourcePackage) {
  const topic = pkg.topic || pkg.title;
  if (node.id === "root") {
    return `${topic} 的总目录。先从薄弱节点进入，再回到讲义、习题或代码实操验证。`;
  }
  if (node.children.length > 0) {
    return `${node.label} 下面还有 ${node.children.length} 个下级考点。先确认概念边界，再用题目检查是否能识别条件和适用场景。`;
  }
  return `${node.label} 可以当作一个独立考点处理：先复述定义，再做一道题验证，不会就回到讲义补概念。`;
}

function buildCoreFocus(label: string) {
  if (/死锁/.test(label)) return "定义、四个必要条件、预防/避免/检测/解除之间的区别。";
  if (/Cache|cache|映射/.test(label)) return "地址划分、行号/组号/标记位，以及命中后如何判断。";
  if (/TCP|握手|挥手/.test(label)) return "状态迁移、序号确认号、为什么需要三次或四次。";
  if (/树|二叉/.test(label)) return "遍历顺序、递归边界、结点关系和存储结构。";
  return "先把定义、适用条件和常见反例分开，不要只背一句话。";
}

function buildExamHandle(label: string) {
  if (/死锁/.test(label)) return "常考资源分配图、银行家算法、安全序列和破坏必要条件。";
  if (/Cache|cache|映射/.test(label)) return "常考直接映射、全相联、组相联的地址位数与替换过程。";
  if (/TCP|握手|挥手/.test(label)) return "常考报文段含义、连接建立/释放步骤和异常状态。";
  if (/树|二叉/.test(label)) return "常考遍历序列互推、线索二叉树、哈夫曼树和树森林转换。";
  return "408 通常考定义辨析、过程推导和边界条件判断。";
}

function buildNextAction(label: string) {
  if (/代码|程序|算法|树|二叉/.test(label)) return "先看讲义，再做一道手写 C 题，把过程落到代码。";
  return "先看讲义抓概念，再做 2 道小题，最后用闪卡复述。";
}

function resourceLinks(pkg: LearningResourcePackage) {
  const labels: Record<string, string> = {
    audio: "微讲义",
    micro_lecture: "微讲义",
    quiz: "练习题",
    exam: "试卷",
    flashcards: "记忆卡",
    code_lab: "代码实操",
    mermaid: "结构图",
  };
  return pkg.assets
    .filter((asset) => labels[asset.type] || asset.label)
    .slice(0, 6)
    .map((asset) => ({
      type: asset.type,
      label: labels[asset.type] || asset.label,
      hint: typeof asset.count === "number" ? `${asset.count}` : "进入",
    }));
}

function cleanLabel(value: unknown, fallback: string) {
  const text = String(value || "").trim();
  if (!text || isInternalLabel(text)) return fallback;
  return text;
}

function isInternalLabel(value: string) {
  return /^(root|node[-_\w]*|asset-\d+)$/i.test(value.trim());
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}
