import {
  Brain,
  MessageSquare,
  Rocket,
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
    lat: 14,
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
    lat: 10,
    color: ["#f59e0b", "#fde68a"],
    prompt: "刷题和看书谁更适合机器学习入门？让 AI 们辩论",
    capability: "debate",
  },
  {
    id: "profile",
    label: "画像",
    icon: Target,
    lon: 300,
    lat: -12,
    color: ["#06b6d4", "#a5f3fc"],
    prompt: "帮我查一下我现在掌握得怎么样，最弱的是什么",
    capability: "agentic",
  },
];
