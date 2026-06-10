"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Boxes,
  Brain,
  MessageSquare,
  Rocket,
  Sparkles,
  Target,
  Wand2,
  type LucideIcon,
} from "lucide-react";

interface KnowledgeOrbital3DProps {
  activeStages?: string[];
  hasFeedback?: boolean;
  hasKnowledge?: boolean;
  hasProfile?: boolean;
  hasResource?: boolean;
  isStreaming?: boolean;
  onRun?: (prompt?: string, capability?: string) => void;
}

interface OrbitalNode {
  id: string;
  label: string;
  icon: LucideIcon;
  /** 经度角 (deg)。0 在前方。 */
  lon: number;
  /** 纬度角 (deg)。0 在赤道。 */
  lat: number;
  /** 渐变色 (起、止) */
  color: [string, string];
  /** 触发对话 prompt（点节点直接发送） */
  prompt: string;
  capability: string;
}

const NODES: OrbitalNode[] = [
  {
    id: "agentic",
    label: "智能路由",
    icon: Sparkles,
    lon: 0,
    lat: 10,
    color: ["#7c3aed", "#a78bfa"],
    prompt: "根据我的画像和掌握度告诉我接下来该学什么",
    capability: "agentic",
  },
  {
    id: "resource",
    label: "资源生成",
    icon: Wand2,
    lon: 60,
    lat: -8,
    color: ["#0ea5e9", "#67e8f9"],
    prompt: "为机器学习入门生成一份完整资源包",
    capability: "resource_gen",
  },
  {
    id: "explainer",
    label: "动画讲解",
    icon: Brain,
    lon: 120,
    lat: 12,
    color: ["#f43f5e", "#fda4af"],
    prompt: "用动画讲清楚反向传播怎么工作",
    capability: "explainer",
  },
  {
    id: "auto",
    label: "Auto-Tutor",
    icon: Rocket,
    lon: 180,
    lat: -6,
    color: ["#10b981", "#6ee7b7"],
    prompt: "我想 2 周入门机器学习，请帮我跑一次完整学习闭环",
    capability: "auto_tutor",
  },
  {
    id: "debate",
    label: "辩论",
    icon: MessageSquare,
    lon: 240,
    lat: 8,
    color: ["#f59e0b", "#fde68a"],
    prompt: "刷题和看书谁更适合机器学习入门？让 AI 们辩论",
    capability: "debate",
  },
  {
    id: "profile",
    label: "画像",
    icon: Target,
    lon: 300,
    lat: -10,
    color: ["#06b6d4", "#a5f3fc"],
    prompt: "帮我查一下我现在掌握得怎么样，最弱的是什么",
    capability: "agentic",
  },
];

/**
 * 3D 知识星轨：纯 CSS3D + SVG，不依赖 three.js。
 *
 * - 中央"知识核心"渐变球 + 光晕脉动
 * - 3 层旋转轨道环（X/Y 倾斜不同）
 * - 6 个 capability 节点沿球面散布，自转跟随场景
 * - 鼠标在容器移动时整体 parallax 倾斜
 * - 节点 hover 放大 + 光晕
 * - 节点点击直接触发 onRun(prompt, capability)
 */
export function KnowledgeOrbital3D({
  isStreaming,
  hasResource,
  hasProfile,
  hasKnowledge,
  hasFeedback,
  onRun,
}: KnowledgeOrbital3DProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [rotateY, setRotateY] = useState(0);

  // 永久自旋（节点位置不变，整个 3D 场景缓慢转）
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const speed = isStreaming ? 0.025 : 0.008; // deg/ms
    const step = (t: number) => {
      const dt = t - last;
      last = t;
      setRotateY((r) => (r + speed * dt) % 360);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [isStreaming]);

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = (e.clientX - cx) / rect.width;
    const dy = (e.clientY - cy) / rect.height;
    setTilt({ x: -dy * 14, y: dx * 14 });
  }
  function handleMouseLeave() {
    setTilt({ x: 0, y: 0 });
  }

  const stats = useMemo(
    () => [
      { label: "画像", on: hasProfile, color: "#06b6d4" },
      { label: "资源", on: hasResource, color: "#a78bfa" },
      { label: "知识", on: hasKnowledge, color: "#10b981" },
      { label: "反馈", on: hasFeedback, color: "#f43f5e" },
    ],
    [hasProfile, hasResource, hasKnowledge, hasFeedback],
  );

  const R = 165; // 球面半径

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="relative mx-auto my-6 h-[420px] w-full max-w-[640px] select-none"
      style={{ perspective: "1100px", perspectiveOrigin: "50% 50%" }}
    >
      {/* 背景星空粒子 */}
      <BackgroundStars />

      {/* 3D 场景 */}
      <div
        className="absolute inset-0"
        style={{
          transformStyle: "preserve-3d",
          transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y + rotateY * 0.3}deg)`,
          transition: "transform 200ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        {/* 轨道环 ×3 */}
        <OrbitRing radius={R} tilt={[68, 0, 0]} color="rgba(124, 58, 237, 0.35)" />
        <OrbitRing radius={R * 0.78} tilt={[20, 0, 60]} color="rgba(14, 165, 233, 0.4)" />
        <OrbitRing radius={R * 1.05} tilt={[100, 0, -30]} color="rgba(244, 63, 94, 0.3)" />

        {/* 中央知识核心 */}
        <div
          className="absolute left-1/2 top-1/2"
          style={{
            transform: "translate3d(-50%, -50%, 0)",
            transformStyle: "preserve-3d",
          }}
        >
          <div
            className="relative h-[120px] w-[120px] rounded-full"
            style={{
              background:
                "radial-gradient(circle at 35% 30%, #ffffff 0%, rgba(167,139,250,0.92) 20%, rgba(124,58,237,0.92) 55%, rgba(30,27,75,0.95) 100%)",
              boxShadow:
                "0 0 0 1px rgba(255,255,255,0.6) inset, 0 0 60px rgba(124,58,237,0.55), 0 18px 40px rgba(0,0,0,0.25)",
            }}
          >
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background:
                  "radial-gradient(circle at 70% 70%, rgba(255,255,255,0.4) 0%, transparent 45%)",
                mixBlendMode: "overlay",
              }}
            />
            {/* 光晕脉动 */}
            <span
              className="absolute -inset-6 rounded-full"
              style={{
                background:
                  "radial-gradient(circle, rgba(124,58,237,0.35) 0%, transparent 60%)",
                animation: "lf-orb-pulse 3.6s ease-in-out infinite",
              }}
            />
            {/* 数据流粒子 (条件渲染) */}
            {isStreaming ? <CorePulse /> : null}
          </div>
        </div>

        {/* 节点 */}
        {NODES.map((n) => (
          <OrbitNode
            key={n.id}
            node={n}
            radius={R}
            onClick={() => onRun?.(n.prompt, n.capability)}
            highlight={isStreaming}
          />
        ))}
      </div>

      {/* 底部状态条 */}
      <div className="pointer-events-none absolute inset-x-4 bottom-3 z-20 flex items-center justify-between gap-2 text-[11px]">
        <div className="flex flex-wrap items-center gap-1.5 rounded-full bg-white/70 px-2.5 py-1 backdrop-blur-md dark:bg-white/10">
          {stats.map((s) => (
            <span
              key={s.label}
              className="flex items-center gap-1 rounded-full px-1.5 py-0.5"
              style={{
                color: s.on ? s.color : "var(--muted-foreground)",
                opacity: s.on ? 1 : 0.5,
              }}
            >
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ background: s.on ? s.color : "currentColor" }}
              />
              {s.label}
            </span>
          ))}
        </div>
        <span
          className={`rounded-full px-2.5 py-1 backdrop-blur-md ${
            isStreaming
              ? "bg-[var(--primary)]/15 text-[var(--primary)]"
              : "bg-white/70 text-[var(--muted-foreground)] dark:bg-white/10"
          }`}
        >
          {isStreaming ? "● 运行中" : "○ 待命"}
        </span>
      </div>

      <OrbitalStyles />
    </div>
  );
}

/** 单条轨道环。tilt = [rotateX, rotateY, rotateZ] */
function OrbitRing({
  radius,
  tilt,
  color,
}: {
  radius: number;
  tilt: [number, number, number];
  color: string;
}) {
  return (
    <div
      className="absolute left-1/2 top-1/2 rounded-full"
      style={{
        width: radius * 2,
        height: radius * 2,
        marginLeft: -radius,
        marginTop: -radius,
        transform: `rotateX(${tilt[0]}deg) rotateY(${tilt[1]}deg) rotateZ(${tilt[2]}deg)`,
        transformStyle: "preserve-3d",
        border: `1px solid ${color}`,
        boxShadow: `0 0 30px ${color}`,
      }}
    >
      <span
        className="absolute left-1/2 top-0 block h-1.5 w-1.5 -translate-x-1/2 rounded-full"
        style={{ background: color, animation: "lf-orb-spin 6s linear infinite" }}
      />
    </div>
  );
}

/** 单个 capability 节点：3D 球面定位 + hover/点击交互。 */
function OrbitNode({
  node,
  radius,
  onClick,
  highlight,
}: {
  node: OrbitalNode;
  radius: number;
  onClick: () => void;
  highlight?: boolean;
}) {
  const Icon = node.icon;
  const lonRad = (node.lon * Math.PI) / 180;
  const latRad = (node.lat * Math.PI) / 180;
  const x = radius * Math.cos(latRad) * Math.sin(lonRad);
  const y = -radius * Math.sin(latRad);
  const z = radius * Math.cos(latRad) * Math.cos(lonRad);

  return (
    <button
      type="button"
      onClick={onClick}
      title={node.label}
      className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
      style={{
        transform: `translate3d(${x}px, ${y}px, ${z}px) translate(-50%, -50%)`,
        transformStyle: "preserve-3d",
      }}
    >
      {/* 反 3D 场景旋转，让节点始终面向观众 */}
      <span
        className="group inline-flex flex-col items-center"
        style={{ transform: "rotateY(0deg)" }}
      >
        <span
          className={`relative inline-flex h-[52px] w-[52px] items-center justify-center rounded-2xl text-white shadow-lg transition active:scale-95 group-hover:scale-110`}
          style={{
            background: `linear-gradient(135deg, ${node.color[0]} 0%, ${node.color[1]} 100%)`,
            boxShadow: `0 10px 26px ${node.color[0]}55, 0 0 0 1px rgba(255,255,255,0.4) inset`,
          }}
        >
          <Icon size={20} />
          {/* 光晕：流式时所有节点亮 */}
          {highlight ? (
            <span
              className="absolute -inset-2 rounded-2xl"
              style={{
                background: `radial-gradient(circle, ${node.color[0]}55 0%, transparent 60%)`,
                animation: "lf-orb-pulse 2.4s ease-in-out infinite",
              }}
            />
          ) : null}
        </span>
        <span className="mt-1.5 whitespace-nowrap rounded-full bg-white/85 px-2 py-0.5 text-[10px] font-medium text-slate-700 shadow-sm backdrop-blur-md dark:bg-white/10 dark:text-white">
          {node.label}
        </span>
      </span>
    </button>
  );
}

/** 流式时的核心粒子流 */
function CorePulse() {
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <span
          key={i}
          className="absolute left-1/2 top-1/2 h-1.5 w-1.5 rounded-full bg-white"
          style={{
            transform: `translate(-50%, -50%)`,
            animation: `lf-orb-emit 1.8s ${i * 0.3}s ease-out infinite`,
            opacity: 0,
          }}
        />
      ))}
    </>
  );
}

/** 背景星空（绝对定位的点点） */
function BackgroundStars() {
  const stars = useMemo(
    () =>
      Array.from({ length: 40 }).map(() => ({
        x: Math.random() * 100,
        y: Math.random() * 100,
        s: Math.random() * 1.5 + 0.5,
        d: Math.random() * 3,
      })),
    [],
  );
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl">
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 35%, rgba(124,58,237,0.10) 0%, transparent 55%), radial-gradient(ellipse at 75% 80%, rgba(14,165,233,0.10) 0%, transparent 50%)",
        }}
      />
      {stars.map((s, i) => (
        <span
          key={i}
          className="absolute rounded-full bg-white/80"
          style={{
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: s.s,
            height: s.s,
            animation: `lf-orb-twinkle 3s ${s.d}s ease-in-out infinite`,
          }}
        />
      ))}
    </div>
  );
}

/** 注入组件级 keyframes（避免污染 globals）。 */
function OrbitalStyles() {
  return (
    <style jsx global>{`
      @keyframes lf-orb-pulse {
        0%, 100% { opacity: 0.45; transform: scale(1); }
        50% { opacity: 0.85; transform: scale(1.12); }
      }
      @keyframes lf-orb-spin {
        from { transform: translate(-50%, 0) rotate(0deg); }
        to { transform: translate(-50%, 0) rotate(360deg); }
      }
      @keyframes lf-orb-twinkle {
        0%, 100% { opacity: 0.2; }
        50% { opacity: 1; }
      }
      @keyframes lf-orb-emit {
        0% { transform: translate(-50%, -50%) scale(0.4); opacity: 0.9; }
        100% { transform: translate(-50%, -50%) scale(8); opacity: 0; }
      }
    `}</style>
  );
}
