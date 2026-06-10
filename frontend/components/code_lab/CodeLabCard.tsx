"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CodeLabResource, CodeLabSnippet } from "@/lib/api";

interface CodeLabCardProps {
  codeLab: CodeLabResource;
}

/**
 * 浏览器内 Pyodide 沙箱：在用户点击运行时按需加载 pyodide CDN，
 * 把当前 snippet 的代码送进去执行并把 stdout 写到面板里。
 *
 * 安全性：
 * - 后端 CodeLabGenerator 已用正则护栏阻挡 os/subprocess/eval/网络等危险调用；
 * - Pyodide 本身运行在浏览器 WASM 沙箱里，无文件系统/网络副作用；
 * - 不允许 input()，所有变量需要在代码内固定。
 */
export function CodeLabCard({ codeLab }: CodeLabCardProps) {
  const snippets = codeLab.snippets || [];
  const [activeIdx, setActiveIdx] = useState(0);
  const [editing, setEditing] = useState(snippets[0]?.code ?? "");
  const [output, setOutput] = useState<string>("");
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");

  const pyodideRef = useRef<any>(null);

  useEffect(() => {
    setEditing(snippets[activeIdx]?.code ?? "");
    setOutput("");
  }, [activeIdx, snippets]);

  const ensurePyodide = useCallback(async () => {
    if (pyodideRef.current) return pyodideRef.current;
    setStatus("loading");
    if (typeof window === "undefined") {
      throw new Error("Pyodide 只在浏览器内可运行");
    }
    if (!(window as any).loadPyodide) {
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js";
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("加载 Pyodide 失败"));
        document.head.appendChild(script);
      });
    }
    const pyodide = await (window as any).loadPyodide({
      indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/",
    });
    pyodideRef.current = pyodide;
    setStatus("ready");
    return pyodide;
  }, []);

  const handleRun = useCallback(async () => {
    setRunning(true);
    setOutput("");
    try {
      const pyodide = await ensurePyodide();
      const buffer: string[] = [];
      pyodide.setStdout({ batched: (msg: string) => buffer.push(msg) });
      pyodide.setStderr({ batched: (msg: string) => buffer.push(`[err] ${msg}`) });
      try {
        const result = await pyodide.runPythonAsync(editing);
        if (result !== undefined && result !== null) {
          buffer.push(String(result));
        }
      } catch (err) {
        buffer.push(`[Python 异常] ${(err as Error).message}`);
      }
      setOutput(buffer.join("\n") || "（无输出）");
    } catch (err) {
      setStatus("error");
      setOutput(`[沙箱启动失败] ${(err as Error).message}`);
    } finally {
      setRunning(false);
    }
  }, [editing, ensurePyodide]);

  if (!snippets.length) return null;

  const snippet: CodeLabSnippet = snippets[activeIdx];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white/95 p-5 shadow-sm lf-lift">
      <header className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">
            🧪 {codeLab.title || "代码实操沙箱"}
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            浏览器内 Pyodide WebAssembly 沙箱 · 安全运行 Python · {snippets.length} 个片段
          </p>
        </div>
        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
          {status === "loading"
            ? "沙箱加载中…"
            : status === "ready"
              ? "沙箱已就绪"
              : status === "error"
                ? "沙箱不可用"
                : "首次运行将加载 Pyodide"}
        </span>
      </header>

      {snippets.length > 1 ? (
        <nav className="mb-3 flex flex-wrap gap-2">
          {snippets.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setActiveIdx(i)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                i === activeIdx
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {i + 1}. {s.title}
            </button>
          ))}
        </nav>
      ) : null}

      {snippet.description ? (
        <p className="mb-2 text-sm text-slate-600">{snippet.description}</p>
      ) : null}

      <textarea
        value={editing}
        onChange={(e) => setEditing(e.target.value)}
        className="block w-full rounded-xl border border-slate-200 bg-slate-950/95 p-3 font-mono text-xs text-slate-100 outline-none focus:border-slate-400"
        rows={Math.min(18, Math.max(6, editing.split("\n").length + 1))}
        spellCheck={false}
      />

      <div className="mt-3 flex items-center justify-between gap-3">
        <button
          type="button"
          disabled={running}
          onClick={handleRun}
          className="rounded-full bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white shadow hover:bg-emerald-700 disabled:opacity-60"
        >
          {running ? "运行中…" : "▶ 运行"}
        </button>
        {snippet.expected_output ? (
          <span className="text-xs text-slate-500">
            预期：<span className="font-mono">{snippet.expected_output.slice(0, 80)}</span>
          </span>
        ) : null}
      </div>

      <pre className="mt-3 max-h-48 overflow-auto rounded-xl bg-slate-950/95 p-3 font-mono text-xs leading-5 text-emerald-300">
        {output || "（点击 ▶ 运行 查看输出）"}
      </pre>

      {snippet.hints?.length ? (
        <ul className="mt-3 list-inside list-disc text-xs text-slate-500">
          {snippet.hints.map((hint, i) => (
            <li key={i}>{hint}</li>
          ))}
        </ul>
      ) : null}

      {codeLab.practice_tasks?.length ? (
        <div className="mt-4 rounded-xl bg-slate-50 p-3">
          <p className="mb-1 text-xs font-semibold text-slate-700">📝 练习任务</p>
          <ul className="list-inside list-decimal space-y-1 text-xs text-slate-600">
            {codeLab.practice_tasks.map((task, i) => (
              <li key={i}>{task}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
