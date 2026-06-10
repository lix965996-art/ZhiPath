"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";

type ToastKind = "error" | "success" | "info";

interface ToastEvent {
  id: number;
  kind: ToastKind;
  message: string;
  ttlMs: number;
}

let nextId = 1;
const listeners: Set<(t: ToastEvent) => void> = new Set();

/** 全局 toast 入口：组件可在任意位置调用 toast({ ... })。 */
export function toast(kind: ToastKind, message: string, ttlMs = 4000) {
  const ev: ToastEvent = { id: nextId++, kind, message, ttlMs };
  listeners.forEach((fn) => fn(ev));
}

export const showError = (m: string, ttl = 5000) => toast("error", m, ttl);
export const showSuccess = (m: string, ttl = 3000) => toast("success", m, ttl);
export const showInfo = (m: string, ttl = 3500) => toast("info", m, ttl);

export function ToastViewport() {
  const [items, setItems] = useState<ToastEvent[]>([]);

  useEffect(() => {
    const listener = (ev: ToastEvent) => {
      setItems((prev) => [...prev, ev]);
      setTimeout(() => {
        setItems((prev) => prev.filter((x) => x.id !== ev.id));
      }, ev.ttlMs);
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[9999] flex flex-col items-center gap-2">
      {items.map((item) => (
        <div
          key={item.id}
          className={`pointer-events-auto flex max-w-[420px] items-start gap-2 rounded-xl border px-3 py-2 shadow-lg backdrop-blur ${
            item.kind === "error"
              ? "border-red-200 bg-red-50 text-red-800"
              : item.kind === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-blue-200 bg-blue-50 text-blue-800"
          }`}
        >
          {item.kind === "error" ? (
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
          ) : item.kind === "success" ? (
            <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
          ) : (
            <Info size={15} className="mt-0.5 shrink-0" />
          )}
          <span className="text-xs leading-5">{item.message}</span>
          <button
            type="button"
            className="ml-2 text-current opacity-50 hover:opacity-100"
            onClick={() => setItems((prev) => prev.filter((x) => x.id !== item.id))}
            aria-label="关闭"
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
