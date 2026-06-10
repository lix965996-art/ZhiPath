"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
  scope?: string; // "page" | "section" | "card"，影响 fallback 视觉密度
}

interface State {
  error: Error | null;
}

/**
 * 单组件崩溃只渲染局部 fallback，整页其他部分继续可用。
 * 演示稳定性必备 —— 任何 React 渲染异常都不会把整页变白屏。
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // 上报 console，便于本地调试
    console.error("[ZhiPath ErrorBoundary]", error, info.componentStack);
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.reset);

    const isPage = this.props.scope === "page";
    return (
      <div
        className={`flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 text-amber-800 ${
          isPage ? "m-8 p-6 text-sm" : "m-2 p-3 text-xs"
        }`}
      >
        <AlertTriangle size={isPage ? 22 : 16} className="mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            {isPage ? "页面渲染遇到问题，已隔离" : "该组件渲染异常"}
          </p>
          <p className="mt-1 break-all opacity-90">{error.message || String(error)}</p>
          <button
            type="button"
            onClick={this.reset}
            className="mt-2 inline-flex items-center gap-1 rounded-full border border-amber-300 bg-white/60 px-3 py-1 font-medium hover:bg-white"
          >
            <RotateCcw size={12} />
            重试本组件
          </button>
        </div>
      </div>
    );
  }
}
