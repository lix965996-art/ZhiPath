import type { SemanticMap, MasterySnapshot, LearningHistory } from "@/lib/api";

/**
 * 认知星图数据层
 *
 * 星图骨架 = 一份**精选的 408 考纲知识点图谱**（4 科 × 核心考点 + 前置依赖）。
 * 408 考纲是公开且固定的，这张 KC 图本身就是一个真实的领域产物。
 *
 * 它再绑定到**真实数据**：
 * - 每个考点统计真实语料命中片数（来自 /semantic_map 的真 chunk）→ 召回追溯的入口
 * - 掌握度优先取真实 BKT（/mastery），无会话时回退到示例进度（明确标注）
 *
 * 本模块只产出"地图模型"，不渲染、不发请求（纯函数，便于测试与 SSR）。
 */

export type SubjectKey = "ds" | "co" | "os" | "cn";

export interface Subject {
  key: SubjectKey;
  label: string;
  /** 星座锚点（归一化 0-1，组件再按 viewBox 缩放） */
  ax: number;
  ay: number;
}

export const SUBJECTS: Subject[] = [
  { key: "ds", label: "数据结构", ax: 0.23, ay: 0.27 },
  { key: "co", label: "计算机组成原理", ax: 0.77, ay: 0.27 },
  { key: "os", label: "操作系统", ax: 0.23, ay: 0.75 },
  { key: "cn", label: "计算机网络", ax: 0.77, ay: 0.75 },
];

export interface StarKC {
  id: string;
  label: string;
  subject: SubjectKey;
  /** 0-1，难度，仅用于排序/微调 */
  difficulty: number;
  /** 语料命中关键词（中英文，子串匹配真实 chunk 标题/标签） */
  keywords: string[];
  /** 前置考点 id（构成依赖边 + 补救航线） */
  prereq: string[];
  /** 无真实 BKT 时的示例掌握度（0-1，明确标注为"示例进度"） */
  demoMastery: number;
}

export const KC_408: StarKC[] = [
  // ── 数据结构 ──────────────────────────────────────────────
  { id: "ds_linear", label: "线性表", subject: "ds", difficulty: 0.3, keywords: ["线性表", "链表", "顺序表", "栈", "队列"], prereq: [], demoMastery: 0.78 },
  { id: "ds_tree", label: "树与二叉树", subject: "ds", difficulty: 0.5, keywords: ["二叉树", "树", "遍历", "binary_tree", "tree_node"], prereq: ["ds_linear"], demoMastery: 0.62 },
  { id: "ds_avl", label: "AVL 树", subject: "ds", difficulty: 0.7, keywords: ["avl", "平衡", "红黑"], prereq: ["ds_tree"], demoMastery: 0.45 },
  { id: "ds_graph", label: "图", subject: "ds", difficulty: 0.6, keywords: ["图", "最短路径", "dijkstra", "拓扑", "生成树", "graph"], prereq: ["ds_tree"], demoMastery: 0.58 },
  { id: "ds_sort", label: "排序", subject: "ds", difficulty: 0.4, keywords: ["排序", "快速排序", "堆排序", "归并", "sort"], prereq: ["ds_linear"], demoMastery: 0.72 },
  { id: "ds_hash", label: "查找与哈希", subject: "ds", difficulty: 0.5, keywords: ["查找", "哈希", "散列", "折半", "b树", "hash"], prereq: ["ds_linear"], demoMastery: 0.5 },

  // ── 计算机组成原理 ────────────────────────────────────────
  { id: "co_data", label: "数据表示", subject: "co", difficulty: 0.4, keywords: ["补码", "原码", "浮点", "数据表示", "ieee"], prereq: [], demoMastery: 0.66 },
  { id: "co_cache", label: "Cache 映射", subject: "co", difficulty: 0.6, keywords: ["cache", "映射", "直接映射", "组相联", "存储系统"], prereq: ["co_data"], demoMastery: 0.42 },
  { id: "co_inst", label: "指令系统", subject: "co", difficulty: 0.5, keywords: ["指令", "寻址", "寻址方式", "cisc", "risc"], prereq: [], demoMastery: 0.55 },
  { id: "co_cpu", label: "CPU 与流水线", subject: "co", difficulty: 0.7, keywords: ["cpu", "流水线", "数据通路", "控制器"], prereq: ["co_inst"], demoMastery: 0.48 },
  { id: "co_mem", label: "主存储器", subject: "co", difficulty: 0.5, keywords: ["主存", "存储器", "dram", "sram"], prereq: ["co_cache"], demoMastery: 0.5 },
  { id: "co_bus", label: "总线与 I/O", subject: "co", difficulty: 0.5, keywords: ["总线", "中断", "dma", "io"], prereq: [], demoMastery: 0.6 },

  // ── 操作系统 ──────────────────────────────────────────────
  { id: "os_proc", label: "进程管理", subject: "os", difficulty: 0.4, keywords: ["进程", "线程", "pcb", "进程状态"], prereq: [], demoMastery: 0.64 },
  { id: "os_sched", label: "处理机调度", subject: "os", difficulty: 0.5, keywords: ["调度", "fcfs", "sjf", "时间片", "周转"], prereq: ["os_proc"], demoMastery: 0.55 },
  { id: "os_deadlock", label: "死锁", subject: "os", difficulty: 0.6, keywords: ["死锁", "银行家", "资源分配"], prereq: ["os_sched"], demoMastery: 0.32 },
  { id: "os_mem", label: "内存管理", subject: "os", difficulty: 0.6, keywords: ["内存管理", "分页", "分段", "页表", "地址转换"], prereq: ["os_proc"], demoMastery: 0.5 },
  { id: "os_vm", label: "虚拟存储器", subject: "os", difficulty: 0.7, keywords: ["虚拟内存", "请求分页", "页面置换", "lru", "缺页"], prereq: ["os_mem"], demoMastery: 0.41 },
  { id: "os_file", label: "文件管理", subject: "os", difficulty: 0.5, keywords: ["文件", "磁盘调度", "目录", "索引"], prereq: [], demoMastery: 0.6 },

  // ── 计算机网络 ────────────────────────────────────────────
  { id: "cn_phys", label: "物理层", subject: "cn", difficulty: 0.3, keywords: ["物理层", "信道", "编码", "奈奎斯特"], prereq: [], demoMastery: 0.72 },
  { id: "cn_link", label: "数据链路层", subject: "cn", difficulty: 0.5, keywords: ["数据链路", "帧", "crc", "csma", "以太网", "滑动窗口"], prereq: ["cn_phys"], demoMastery: 0.66 },
  { id: "cn_net", label: "网络层", subject: "cn", difficulty: 0.6, keywords: ["网络层", "ip", "路由", "子网", "arp", "cidr"], prereq: ["cn_link"], demoMastery: 0.6 },
  { id: "cn_tcp", label: "运输层 TCP", subject: "cn", difficulty: 0.6, keywords: ["tcp", "三次握手", "拥塞控制", "运输层", "可靠传输"], prereq: ["cn_net"], demoMastery: 0.68 },
  { id: "cn_app", label: "应用层", subject: "cn", difficulty: 0.4, keywords: ["应用层", "dns", "http", "https", "smtp"], prereq: ["cn_tcp"], demoMastery: 0.7 },
];

export type Tier = "mastered" | "consolidating" | "weak";

export function tierOf(mastery: number): Tier {
  if (mastery >= 0.7) return "mastered";
  if (mastery >= 0.45) return "consolidating";
  return "weak";
}

export interface StarNode {
  id: string;
  label: string;
  subject: SubjectKey;
  x: number; // 归一化 0-1
  y: number;
  mastery: number; // 0-1
  assessed: boolean;
  tier: Tier;
  corpusCount: number; // 真实语料命中片数
  learningCount: number; // 真实学习次数（基于会话消息关键词命中）
  prereq: string[];
}

export interface StarLink {
  source: string;
  target: string;
}

export interface StarmapModel {
  nodes: StarNode[];
  links: StarLink[];
  /** 补救航线：从最薄弱考点回溯的薄弱前置链（有序 id） */
  remediation: string[];
  mode: "real" | "unassessed";
  litCount: number;
  total: number;
  avgMastery: number; // 0-1
  /** 已学习的知识点数量 */
  learnedCount: number;
  /** 最近学习的知识点 id 列表（用于轨迹线） */
  recentLearned: string[];
}

/** 确定性伪随机（mulberry32），保证 SSR 与 client 位置一致。 */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 把一段文本归一化为小写 haystack。 */
function norm(text: string): string {
  return text.toLowerCase();
}

/** 统计某考点在真实语料里的命中片数。 */
function corpusCountFor(kc: StarKC, haystacks: string[]): number {
  const kws = kc.keywords.map(norm);
  let count = 0;
  for (const h of haystacks) {
    if (kws.some((kw) => h.includes(kw))) count += 1;
  }
  return count;
}

/** 真实 BKT 标签 → 掌握度，按标签互相包含模糊匹配。 */
function masteryFromSnapshot(kc: StarKC, snapshot: MasterySnapshot): number | null {
  const label = norm(kc.label);
  let best: number | null = null;
  for (const item of snapshot.kcs) {
    const l = norm(item.label || item.kc_id || "");
    if (!l) continue;
    if (l.includes(label) || label.includes(l) || kc.keywords.some((kw) => l.includes(norm(kw)))) {
      best = item.mastery;
      break;
    }
  }
  return best;
}

export interface BuildOpts {
  semanticMap: SemanticMap | null;
  mastery: MasterySnapshot | null;
  learningHistory?: Record<string, number> | null;
}

/** 由真实语料 + 真实掌握度 + 真实学习历史构建星图模型。 */
export function buildStarmap({ semanticMap, mastery, learningHistory }: BuildOpts): StarmapModel {
  const haystacks = (semanticMap?.nodes ?? []).map((n) =>
    norm(`${n.title} ${(n.tags ?? []).join(" ")}`),
  );
  const hasReal = Boolean(mastery && mastery.kcs && mastery.kcs.length > 0);
  const hasLearning = Boolean(learningHistory && Object.keys(learningHistory).length > 0);
  const subjectAnchor = new Map(SUBJECTS.map((s) => [s.key, s]));

  const nodes: StarNode[] = KC_408.map((kc) => {
    const anchor = subjectAnchor.get(kc.subject)!;
    const peers = KC_408.filter((k) => k.subject === kc.subject);
    const index = peers.findIndex((k) => k.id === kc.id);
    const n = peers.length;

    // 星座簇布局：锚点周围一圈 + 确定性微抖动 → 有机但稳定
    const rng = seeded(hashId(kc.id));
    const baseAngle = (index / Math.max(1, n)) * Math.PI * 2 + (kc.subject === "ds" || kc.subject === "os" ? -0.4 : 0.4);
    const rx = 0.1 + rng() * 0.035;
    const ry = 0.155 + rng() * 0.05;
    const x = Math.min(0.95, Math.max(0.05, anchor.ax + Math.cos(baseAngle) * rx));
    const y = Math.min(0.95, Math.max(0.05, anchor.ay + Math.sin(baseAngle) * ry));

    let mVal = 0;
    if (hasReal) {
      const real = masteryFromSnapshot(kc, mastery!);
      mVal = real == null ? 0 : real;
    }

    // 学习次数：优先使用真实学习历史，否则用 demoMastery 估算
    const learningCount = hasLearning ? (learningHistory?.[kc.id] ?? 0) : Math.round(kc.demoMastery * 10);

    return {
      id: kc.id,
      label: kc.label,
      subject: kc.subject,
      x,
      y,
      mastery: mVal,
      assessed: hasReal,
      tier: hasReal ? tierOf(mVal) : "consolidating",
      corpusCount: corpusCountFor(kc, haystacks),
      learningCount,
      prereq: kc.prereq,
    };
  });

  const links: StarLink[] = [];
  for (const kc of KC_408) {
    for (const p of kc.prereq) links.push({ source: p, target: kc.id });
  }

  const remediation = buildRemediation(nodes);

  const litCount = nodes.filter((nd) => nd.tier === "mastered").length;
  const avg = nodes.length ? nodes.reduce((s, nd) => s + nd.mastery, 0) / nodes.length : 0;

  // 已学习的知识点（learningCount > 0）
  const learnedNodes = nodes.filter((nd) => nd.learningCount > 0);
  const learnedCount = learnedNodes.length;

  // 最近学习的知识点（按 learningCount 排序，取前 5 个）
  const recentLearned = [...learnedNodes]
    .sort((a, b) => b.learningCount - a.learningCount)
    .slice(0, 5)
    .map((nd) => nd.id);

  return {
    nodes,
    links,
    remediation,
    mode: hasReal ? "real" : "unassessed",
    litCount,
    total: nodes.length,
    avgMastery: avg,
    learnedCount,
    recentLearned,
  };
}

/** 从最薄弱考点向上回溯薄弱前置，构成补救航线。 */
function buildRemediation(nodes: StarNode[]): string[] {
  if (!nodes.length) return [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  // 目标 = 最薄弱且有前置的考点
  const candidates = nodes.filter((n) => n.prereq.length > 0).sort((a, b) => a.mastery - b.mastery);
  const target = candidates[0] ?? [...nodes].sort((a, b) => a.mastery - b.mastery)[0];
  if (!target) return [];

  const chain: string[] = [target.id];
  let cur = target;
  const guard = new Set<string>([target.id]);
  while (cur.prereq.length > 0) {
    // 选掌握度最低的前置继续回溯
    const parents = cur.prereq.map((p) => byId.get(p)).filter((p): p is StarNode => Boolean(p));
    if (!parents.length) break;
    parents.sort((a, b) => a.mastery - b.mastery);
    const weakest = parents[0];
    if (guard.has(weakest.id)) break;
    chain.unshift(weakest.id);
    guard.add(weakest.id);
    // 前置已掌握则停（它是稳固的起点）
    if (weakest.mastery >= 0.6) break;
    cur = weakest;
  }
  return chain.length >= 2 ? chain : [];
}

/** 查询 → 命中考点 id（词法子串匹配，给地图高亮 + 彗星落点用；真召回另走 /search）。 */
export function matchKCs(query: string, nodes: StarNode[]): string[] {
  const q = norm(query).trim();
  if (!q) return [];
  const byId = new Map(KC_408.map((k) => [k.id, k]));
  const scored: Array<{ id: string; score: number }> = [];
  for (const nd of nodes) {
    const kc = byId.get(nd.id);
    if (!kc) continue;
    let score = 0;
    if (q.includes(norm(kc.label)) || norm(kc.label).includes(q)) score += 3;
    for (const kw of kc.keywords) {
      if (q.includes(norm(kw))) score += 2;
    }
    if (score > 0) scored.push({ id: nd.id, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.id);
}

export function kcById(id: string): StarKC | undefined {
  return KC_408.find((k) => k.id === id);
}

export function subjectLabel(key: SubjectKey): string {
  return SUBJECTS.find((s) => s.key === key)?.label ?? key;
}
