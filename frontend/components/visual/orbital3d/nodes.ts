import {
  Brain,
  MessageSquare,
  Sparkles,
  Target,
  Wand2,
  type LucideIcon,
} from "lucide-react";

export interface OrbitalNode {
  id: string;
  label: string;
  icon: LucideIcon;
  /** 经度角 (deg)，0 在前方 */
  lon: number;
  /** 纬度角 (deg)，0 在赤道 */
  lat: number;
  /** [核心色, 高亮色]，HEX */
  color: [string, string];
  /** 点击 = 触发对话 prompt */
  prompt: string;
  /** 对应后端 capability */
  capability: string;
}

export const ORBITAL_NODES: OrbitalNode[] = [
  {
    id: "agentic",
    label: "智能路由",
    icon: Sparkles,
    lon: 0,
    lat: 12,
    color: ["#7c3aed", "#a78bfa"],
    prompt: "根据我的 408 掌握度告诉我接下来该补哪一科",
    capability: "agentic",
  },
  {
    id: "resource",
    label: "资源生成",
    icon: Wand2,
    lon: 60,
    lat: -8,
    color: ["#0ea5e9", "#67e8f9"],
    prompt: "为 408 操作系统死锁生成一份完整资源包",
    capability: "resource_gen",
  },
  {
    id: "explainer",
    label: "动画讲解",
    icon: Brain,
    lon: 120,
    lat: 14,
    color: ["#f43f5e", "#fda4af"],
    prompt: "用动画讲清楚 Cache 三种映射方式",
    capability: "explainer",
  },
  {
    id: "debate",
    label: "辩论",
    icon: MessageSquare,
    lon: 210,
    lat: 10,
    color: ["#f59e0b", "#fde68a"],
    prompt: "408 冲刺阶段刷真题和看讲义哪个更优先？让 AI 们辩论",
    capability: "debate",
  },
  {
    id: "profile",
    label: "画像",
    icon: Target,
    lon: 285,
    lat: -12,
    color: ["#06b6d4", "#a5f3fc"],
    prompt: "帮我查一下我现在 408 掌握得怎么样，最弱的是哪一科",
    capability: "agentic",
  },
];
