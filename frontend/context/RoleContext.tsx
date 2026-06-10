"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Role = "student" | "teacher" | "showcase";

interface RoleContextValue {
  role: Role;
  setRole: (r: Role) => void;
  /** 当前角色是否需要显示某类界面元素 — 业务组件统一查这个 */
  shouldShow: (slot: VisibleSlot) => boolean;
}

/** 不同角色下控制显示的"可见槽位"。集中在这里管理，避免散落在组件里。 */
export type VisibleSlot =
  // 左侧导航
  | "nav.profile"
  | "nav.path"
  | "nav.knowledge"
  | "nav.resources"
  | "nav.dashboard"
  | "nav.classroom"
  | "nav.overview"
  // 右侧面板
  | "panel.agent_graph" // 多智能体协作图
  | "panel.agent_feed" // Agent 通信轨迹
  | "panel.profile_evidence" // 画像证据链
  | "panel.auto_tutor_loop" // Auto-Tutor 闭环
  | "panel.knowledge_sources" // 引用追溯
  | "panel.pomodoro" // 番茄钟
  | "panel.pdf_report" // PDF 周报下载
  // 顶部菜单
  | "demo.panel" // 完整 demo 面板（不止 compact）
  // 主面板
  | "chat.guardrail"; // 内容安全告警条

const STORAGE_KEY = "zhipath-role-v1";

const SLOTS_BY_ROLE: Record<Role, Set<VisibleSlot>> = {
  // 学生模式：聚焦学习，藏掉炫技和教师场景
  student: new Set<VisibleSlot>([
    "nav.profile",
    "nav.path",
    "nav.resources",
    "nav.knowledge",
    "panel.profile_evidence",
    "panel.pomodoro",
    "panel.pdf_report",
    "chat.guardrail",
  ]),
  // 教师模式：聚焦班级与个人学情
  teacher: new Set<VisibleSlot>([
    "nav.classroom",
    "nav.dashboard",
    "nav.resources",
    "nav.knowledge",
    "panel.profile_evidence",
    "panel.pdf_report",
    "chat.guardrail",
  ]),
  // 演示模式：解锁所有炫技面板
  showcase: new Set<VisibleSlot>([
    "nav.profile",
    "nav.path",
    "nav.knowledge",
    "nav.resources",
    "nav.dashboard",
    "nav.classroom",
    "nav.overview",
    "panel.agent_graph",
    "panel.agent_feed",
    "panel.profile_evidence",
    "panel.auto_tutor_loop",
    "panel.knowledge_sources",
    "panel.pomodoro",
    "panel.pdf_report",
    "demo.panel",
    "chat.guardrail",
  ]),
};

const RoleContext = createContext<RoleContextValue | null>(null);

export function RoleProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<Role>("student");

  // 首次加载时读 localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(STORAGE_KEY) as Role | null;
    if (saved === "student" || saved === "teacher" || saved === "showcase") {
      setRoleState(saved);
    }
  }, []);

  const setRole = useCallback((r: Role) => {
    setRoleState(r);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, r);
    }
  }, []);

  const value = useMemo<RoleContextValue>(() => {
    const slots = SLOTS_BY_ROLE[role];
    return {
      role,
      setRole,
      shouldShow: (slot) => slots.has(slot),
    };
  }, [role, setRole]);

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole(): RoleContextValue {
  const ctx = useContext(RoleContext);
  // 无 Provider 时返回默认 student（不抛错，避免页面崩）
  if (!ctx) {
    return {
      role: "student",
      setRole: () => undefined,
      shouldShow: (slot) => SLOTS_BY_ROLE.student.has(slot),
    };
  }
  return ctx;
}
