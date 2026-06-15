import { SUBJECTS, type StarmapModel, type StarNode, type SubjectKey, type Tier } from "../starmap-data";

/**
 * 知识之树 · 3D 布局（纯函数，不依赖 three，便于 SSR/测试）
 *
 * 几何即数据：
 * - 树形分叉 = 前置依赖（根=基础考点，越深越高=越高阶）
 * - 果实位置由"科目扇区 + 依赖深度 + 同层横向展开"确定（确定性，稳定）
 * - 果实大小 = 真实语料命中片数；颜色/亮度 = 真实掌握度（在场景里用）
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface TreeFruit {
  id: string;
  label: string;
  subject: SubjectKey;
  tier: Tier;
  mastery: number;
  corpusCount: number;
  depth: number;
  pos: Vec3;
  size: number;
}

export interface TreeBranch {
  id: string;
  from: Vec3;
  to: Vec3;
  ctrl: Vec3;
  radius: number;
}

export interface TreeAnchor {
  key: SubjectKey;
  label: string;
  pos: Vec3;
}

export interface TreeLayout {
  trunk: { from: Vec3; to: Vec3; radius: number };
  branches: TreeBranch[];
  fruits: TreeFruit[];
  anchors: TreeAnchor[];
}

const TRUNK_BASE_Y = -1.85;
const TRUNK_TOP_Y = 0.05;

function angleFor(subject: SubjectKey): number {
  const i = SUBJECTS.findIndex((s) => s.key === subject);
  return (i * Math.PI) / 2 + Math.PI / 4; // 四象限，偏 45°
}

function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
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

export function buildTreeLayout(model: StarmapModel): TreeLayout {
  const byId = new Map(model.nodes.map((n) => [n.id, n]));

  // 依赖深度（最长前置链）
  const depthMemo = new Map<string, number>();
  const depthOf = (id: string, stack: Set<string> = new Set()): number => {
    const cached = depthMemo.get(id);
    if (cached != null) return cached;
    const n = byId.get(id);
    if (!n || n.prereq.length === 0 || stack.has(id)) {
      depthMemo.set(id, 0);
      return 0;
    }
    stack.add(id);
    let d = 0;
    for (const p of n.prereq) d = Math.max(d, depthOf(p, stack) + 1);
    stack.delete(id);
    depthMemo.set(id, d);
    return d;
  };

  // 同 (科目, 深度) 分组 → 横向展开索引
  const levelKey = (n: StarNode) => `${n.subject}:${depthOf(n.id)}`;
  const levels = new Map<string, StarNode[]>();
  for (const n of model.nodes) {
    const k = levelKey(n);
    const arr = levels.get(k) ?? [];
    arr.push(n);
    levels.set(k, arr);
  }

  // pass 1：算每个考点的 3D 坐标
  const posOf = new Map<string, Vec3>();
  const fruits: TreeFruit[] = [];
  for (const n of model.nodes) {
    const d = depthOf(n.id);
    const ang = angleFor(n.subject);
    const dir = { x: Math.cos(ang), z: Math.sin(ang) };
    const perp = { x: -Math.sin(ang), z: Math.cos(ang) };

    const group = levels.get(levelKey(n)) ?? [n];
    const idx = group.findIndex((g) => g.id === n.id);
    const spread = (idx - (group.length - 1) / 2) * 0.62;

    const r = 0.95 + d * 0.58;
    const h = TRUNK_TOP_Y + 0.3 + d * 0.66;

    const rng = seeded(hashId(n.id));
    const jx = (rng() - 0.5) * 0.22;
    const jy = (rng() - 0.5) * 0.26;
    const jz = (rng() - 0.5) * 0.22;

    const pos: Vec3 = {
      x: dir.x * r + perp.x * spread + jx,
      y: h + jy,
      z: dir.z * r + perp.z * spread + jz,
    };
    posOf.set(n.id, pos);

    fruits.push({
      id: n.id,
      label: n.label,
      subject: n.subject,
      tier: n.tier,
      mastery: n.mastery,
      corpusCount: n.corpusCount,
      depth: d,
      pos,
      size: 0.12 + Math.min(n.corpusCount, 24) / 24 * 0.06,
    });
  }

  // 科目锚点（主枝末端 + 标签位）
  const anchors: TreeAnchor[] = SUBJECTS.map((s) => {
    const ang = angleFor(s.key);
    return {
      key: s.key,
      label: s.label,
      pos: { x: Math.cos(ang) * 0.55, y: TRUNK_TOP_Y + 0.08, z: Math.sin(ang) * 0.55 },
    };
  });
  const anchorOf = new Map(anchors.map((a) => [a.key, a.pos]));

  // pass 2：枝条（父 → 子）。父 = 前置考点位置；无前置 = 科目锚点
  const branches: TreeBranch[] = [];
  // 主枝：树顶 → 各科锚点
  const trunkTop: Vec3 = { x: 0, y: TRUNK_TOP_Y, z: 0 };
  for (const a of anchors) {
    branches.push({
      id: `main-${a.key}`,
      from: trunkTop,
      to: a.pos,
      ctrl: { x: a.pos.x * 0.5, y: TRUNK_TOP_Y + 0.04, z: a.pos.z * 0.5 },
      radius: 0.07,
    });
  }
  for (const n of model.nodes) {
    const to = posOf.get(n.id)!;
    const parentId = n.prereq.find((p) => posOf.has(p));
    const from = parentId ? posOf.get(parentId)! : anchorOf.get(n.subject)!;
    const d = depthOf(n.id);
    const ctrl: Vec3 = {
      x: (from.x + to.x) / 2 + (to.x - from.x) * 0.12,
      y: (from.y + to.y) / 2 + 0.18,
      z: (from.z + to.z) / 2 + (to.z - from.z) * 0.12,
    };
    branches.push({
      id: `b-${n.id}`,
      from,
      to,
      ctrl,
      radius: Math.max(0.018, 0.05 - d * 0.008),
    });
  }

  return {
    trunk: {
      from: { x: 0, y: TRUNK_BASE_Y, z: 0 },
      to: trunkTop,
      radius: 0.16,
    },
    branches,
    fruits,
    anchors,
  };
}

export const TIER_COLOR: Record<Tier, string> = {
  mastered: "#f0a93a",
  consolidating: "#2f86ff",
  weak: "#f4607a",
};

/** 树冠球壳参数（世界坐标，由 GLB 实测包围盒推出）。 */
export interface Canopy {
  cx: number;
  cy: number;
  cz: number;
  radius: number;
}

/**
 * 把考点果实挂到树冠球壳上：方位角按科目扇区，极角按依赖深度
 * （根/基础在下圈，高阶在树顶），大小按语料命中。确定性、稳定。
 */
export function placeFruitsInCanopy(model: StarmapModel, canopy: Canopy): TreeFruit[] {
  const byId = new Map(model.nodes.map((n) => [n.id, n]));
  const depthMemo = new Map<string, number>();
  const depthOf = (id: string, stack: Set<string> = new Set()): number => {
    const c = depthMemo.get(id);
    if (c != null) return c;
    const n = byId.get(id);
    if (!n || n.prereq.length === 0 || stack.has(id)) {
      depthMemo.set(id, 0);
      return 0;
    }
    stack.add(id);
    let d = 0;
    for (const p of n.prereq) d = Math.max(d, depthOf(p, stack) + 1);
    stack.delete(id);
    depthMemo.set(id, d);
    return d;
  };

  const bySubject = new Map<SubjectKey, StarNode[]>();
  for (const n of model.nodes) {
    const a = bySubject.get(n.subject) ?? [];
    a.push(n);
    bySubject.set(n.subject, a);
  }
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

  const fruits: TreeFruit[] = [];
  for (const n of model.nodes) {
    const d = depthOf(n.id);
    const sibs = bySubject.get(n.subject)!;
    const idx = sibs.findIndex((s) => s.id === n.id);
    const az = angleFor(n.subject) + (idx - (sibs.length - 1) / 2) * 0.34;
    const phi = clamp(0.6 * Math.PI - d * 0.075 * Math.PI, 0.26 * Math.PI, 0.6 * Math.PI);
    const rng = seeded(hashId(n.id));
    const rr = canopy.radius * (0.95 + rng() * 0.12);
    fruits.push({
      id: n.id,
      label: n.label,
      subject: n.subject,
      tier: n.tier,
      mastery: n.mastery,
      corpusCount: n.corpusCount,
      depth: d,
      pos: {
        x: canopy.cx + rr * Math.sin(phi) * Math.cos(az),
        y: canopy.cy + rr * Math.cos(phi) * 0.9,
        z: canopy.cz + rr * Math.sin(phi) * Math.sin(az),
      },
      size: canopy.radius * (0.045 + (Math.min(n.corpusCount, 24) / 24) * 0.018),
    });
  }
  return fruits;
}
