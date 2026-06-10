"use client";

import { useEffect, useState } from "react";
import { getModelRoutes, type ModelRouteInfo } from "@/lib/api";

export function ModelRouterPanel() {
  const [routes, setRoutes] = useState<ModelRouteInfo[]>([]);
  const [recent, setRecent] = useState<Array<{ task: string; profile: string; reason: string; success: boolean }>>([]);

  useEffect(() => {
    getModelRoutes()
      .then((data) => {
        setRoutes(data.routes);
        setRecent(data.recent_routing);
      })
      .catch(() => undefined);
  }, []);

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
      <header>
        <h3 className="text-sm font-semibold text-slate-900">🧠 多模型智能路由</h3>
        <p className="mt-0.5 text-xs text-slate-500">
          按任务类型自动选模型，主用不可用自动 fallback。共 {routes.length} 类任务。
        </p>
      </header>
      <ul className="space-y-2">
        {routes.map((r) => (
          <li key={r.name} className="rounded-xl border border-slate-100 px-3 py-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-800">{r.name}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] ${
                  r.primary_available
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-amber-50 text-amber-700"
                }`}
              >
                {r.primary_available ? "主用可用" : "fallback 中"}
              </span>
            </div>
            <p className="mt-0.5 text-slate-500">{r.description}</p>
            <div className="mt-1 font-mono text-[11px] text-slate-600">
              {r.primary} → {r.fallbacks.join(" → ") || "—"}
            </div>
          </li>
        ))}
      </ul>
      {recent.length > 0 ? (
        <details className="rounded-xl bg-slate-50 px-3 py-2 text-xs">
          <summary className="cursor-pointer font-semibold text-slate-700">
            最近 {recent.length} 次路由决策
          </summary>
          <ul className="mt-2 space-y-1 font-mono text-[11px] text-slate-600">
            {recent.slice(-20).reverse().map((r, i) => (
              <li key={i}>
                <span className={r.success ? "text-emerald-600" : "text-amber-600"}>
                  {r.success ? "✓" : "·"}
                </span>{" "}
                {r.task} → {r.profile}{" "}
                <span className="text-slate-400">({r.reason})</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
