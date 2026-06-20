"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Code2,
  Copy,
  Lightbulb,
  Loader2,
  Play,
  RotateCcw,
  Terminal,
} from "lucide-react";
import type { CodeLabCoach, CodeLabResource, CodeLabRunResult, CodeLabSnippet } from "@/lib/api";
import { coachCodeLab, runCCode } from "@/lib/api";

interface CodeLabCardProps {
  codeLab: CodeLabResource;
  onVerify?: (snippetIdx: number, passed: boolean) => void;
}

const C_KEYWORDS = new Set([
  "auto", "break", "case", "char", "const", "continue", "default", "do", "double",
  "else", "enum", "extern", "float", "for", "goto", "if", "int", "long", "register",
  "return", "short", "signed", "sizeof", "static", "struct", "switch", "typedef",
  "union", "unsigned", "void", "volatile", "while",
]);

const C_BUILTINS = new Set([
  "printf", "scanf", "malloc", "free", "sizeof", "strlen", "strcpy", "strcmp",
]);

function escapeHtml(line: string) {
  return line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function highlightC(line: string): string {
  const escaped = escapeHtml(line);
  return escaped.replace(
    /(\/\/.*$)|(\/\*[\s\S]*?\*\/)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(\b\d+(?:\.\d+)?\b)|(\b[a-zA-Z_]\w*\b)|(#\s*\w+)/gm,
    (match, comment, blockComment, str, num, ident, directive) => {
      if (comment || blockComment) return `<span class="tok-comment">${comment || blockComment}</span>`;
      if (str) return `<span class="tok-string">${str}</span>`;
      if (num) return `<span class="tok-number">${num}</span>`;
      if (directive) return `<span class="tok-keyword">${directive}</span>`;
      if (ident) {
        if (C_KEYWORDS.has(ident)) return `<span class="tok-keyword">${ident}</span>`;
        if (C_BUILTINS.has(ident)) return `<span class="tok-builtin">${ident}</span>`;
      }
      return match;
    },
  );
}

function hasRealCLogic(code: string) {
  return (
    /\b(if|for|while|switch|struct|typedef)\b/.test(code) ||
    /\bint\s+(?!main\b)[a-zA-Z_]\w*\s*\([^)]*\)\s*\{/.test(code) ||
    /\bconst\s+char\s*\*\s*(?!main\b)[a-zA-Z_]\w*\s*\([^)]*\)\s*\{/.test(code)
  );
}

function isPrintOnlyC(code: string) {
  if (!/#include|int\s+main\s*\(/.test(code)) return false;
  const withoutStrings = code.replace(/"(?:[^"\\]|\\.)*"/g, "\"\"");
  const printfCount = (withoutStrings.match(/\bprintf\s*\(/g) || []).length;
  return printfCount > 0 && !hasRealCLogic(withoutStrings);
}

// 后端现在总会给出真实 C + 全字段；只有在代码为空或被识别成"只打印清单"时，
// 才用这道紧急兜底换成一个真 C 任务，绝不让编辑器出现假代码。
function emergencySnippet(snippet: CodeLabSnippet): CodeLabSnippet {
  return {
    title: snippet.title || "C 语言任务",
    description: snippet.description || "补全数组统计函数，用循环和条件判断完成一个 408 风格的小程序。",
    language: "c",
    code: [
      "#include <stdio.h>",
      "",
      "int count_greater_equal(int arr[], int n, int threshold) {",
      "    int count = 0;",
      "    /* TODO: 遍历数组，统计大于等于 threshold 的元素个数 */",
      "    return count;",
      "}",
      "",
      "int main(void) {",
      "    int scores[] = {52, 76, 81, 39, 90};",
      "    int n = sizeof(scores) / sizeof(scores[0]);",
      "    printf(\"passed = %d\\n\", count_greater_equal(scores, n, 60));",
      "    return 0;",
      "}",
    ].join("\n"),
    test_input: "",
    expected_output: "passed = 3",
    checkpoints: [{ label: "count_greater_equal(scores, 5, 60) == 3" }],
    hints: snippet.hints ?? ["for 循环遍历定长数组，满足条件时 count 加 1。"],
  };
}

function prepareSnippet(snippet: CodeLabSnippet): CodeLabSnippet {
  const src = snippet.code || "";
  if (/#include|int\s+main\s*\(/.test(src) && !isPrintOnlyC(src)) {
    return { ...snippet, language: "c" };
  }
  return emergencySnippet(snippet);
}

interface StructGate {
  ok: boolean;
  reasons: string[];
}

function structGate(code: string): StructGate {
  const reasons: string[] = [];
  if (/TODO/i.test(code)) reasons.push("还有 TODO 区域未补全");
  if (isPrintOnlyC(code)) reasons.push("代码只是 printf 知识点清单，请改成真实函数逻辑");
  if (!hasRealCLogic(code)) reasons.push("未检测到真实逻辑（自定义函数 / 分支 / 循环 / 数组 / 结构体）");
  return { ok: reasons.length === 0, reasons };
}

export function CodeLabCard({ codeLab, onVerify }: CodeLabCardProps) {
  const cSnippets = useMemo(
    () => (codeLab.snippets || []).map((snippet) => prepareSnippet(snippet)),
    [codeLab.snippets],
  );
  const [activeIdx, setActiveIdx] = useState(0);
  const [editing, setEditing] = useState(cSnippets[0]?.code ?? "");
  const [copied, setCopied] = useState(false);
  const [checking, setChecking] = useState(false);
  const [runResult, setRunResult] = useState<CodeLabRunResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [checkedOnce, setCheckedOnce] = useState(false);
  const [coach, setCoach] = useState<CodeLabCoach | null>(null);
  const [coaching, setCoaching] = useState(false);
  const [coachError, setCoachError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const snippet = cSnippets[activeIdx];
  const gate = useMemo(() => structGate(editing), [editing]);
  const highlighted = useMemo(() => editing.split("\n").map(highlightC), [editing]);
  const lineCount = editing.split("\n").length;

  const logicPassed = !!runResult && runResult.matched_expected === true && gate.ok;
  const noCompiler = runResult?.reason === "no_compiler";

  // 可点拨 = 真跑过一轮、没通过，且不是「无编译器 / 被安全护栏拦截」这类无从点拨的情况。
  const coachable =
    checkedOnce && !checking && !!runResult && !logicPassed &&
    runResult.reason !== "no_compiler" && runResult.reason !== "blocked";

  const coachReason = !runResult
    ? "wrong_output"
    : runResult.reason === "compile_error"
      ? "compile_error"
      : runResult.timed_out || runResult.reason === "timeout"
        ? "timeout"
        : runResult.reason === "runtime_error"
          ? "runtime_error"
          : "wrong_output";

  const handleCoach = async () => {
    if (!runResult) return;
    setCoaching(true);
    setCoachError(null);
    try {
      const c = await coachCodeLab({
        code: editing,
        description: snippet?.description ?? "",
        expected_output: snippet?.expected_output ?? "",
        reason: coachReason,
        stderr: runResult.stderr ?? "",
        diff: runResult.diff ?? [],
      });
      if (c) setCoach(c);
      else setCoachError("导师暂时无法点拨（未配置可用模型），可在设置里检查模型凭据后重试。");
    } catch (err) {
      setCoachError((err as Error).message);
    } finally {
      setCoaching(false);
    }
  };

  // 切换/缩放 snippet 时，把 activeIdx 收敛到合法范围。
  useEffect(() => {
    if (cSnippets.length && activeIdx >= cSnippets.length) setActiveIdx(0);
  }, [cSnippets.length, activeIdx]);

  // 记录当前 tab，用于异步 runCCode 返回时判断用户是否已切走（避免把旧结果贴到新 tab）。
  const activeIdxRef = useRef(activeIdx);
  useEffect(() => {
    activeIdxRef.current = activeIdx;
  }, [activeIdx]);

  useEffect(() => {
    setEditing(cSnippets[activeIdx]?.code ?? "");
    setRunResult(null);
    setRunError(null);
    setCheckedOnce(false);
    setCoach(null);
    setCoachError(null);
  }, [activeIdx, cSnippets]);

  const handleCheck = async () => {
    const runIdx = activeIdx;
    setCheckedOnce(true);
    // 总是真编译真运行（不再因 TODO/结构在客户端拦截），让学生看到真实的编译运行结果。
    setChecking(true);
    setRunError(null);
    try {
      const res = await runCCode({
        code: editing,
        stdin: snippet?.test_input ?? "",
        expected_output: snippet?.expected_output ?? "",
      });
      // 通过 = 实际输出==期望 且 结构达标（防 printf 作弊 / 未补全 TODO）。
      onVerify?.(runIdx, res.matched_expected === true && gate.ok);
      if (activeIdxRef.current === runIdx) setRunResult(res);
    } catch (err) {
      onVerify?.(runIdx, false);
      if (activeIdxRef.current === runIdx) setRunError((err as Error).message);
    } finally {
      if (activeIdxRef.current === runIdx) setChecking(false);
    }
  };

  const handleReset = () => {
    setEditing(snippet?.code ?? "");
    setRunResult(null);
    setRunError(null);
    setCheckedOnce(false);
    setCoach(null);
    setCoachError(null);
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(editing);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleScroll = (event: React.UIEvent<HTMLTextAreaElement>) => {
    const lineNums = event.currentTarget.parentElement?.querySelector(".line-numbers");
    if (lineNums) lineNums.scrollTop = event.currentTarget.scrollTop;
  };

  // 顶部状态条文案
  const statusText = !checkedOnce
    ? "等待练习"
    : checking
      ? "正在判定…"
      : logicPassed
        ? "逻辑通过"
        : noCompiler
          ? "结构检查通过（未检测到编译器）"
          : "逻辑未通过";

  const statusClass = !checkedOnce
    ? "bg-[var(--muted)] text-[var(--muted-foreground)]"
    : logicPassed
      ? "bg-emerald-50 text-emerald-700"
      : "bg-amber-50 text-amber-700";

  if (!cSnippets.length) return null;

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card-solid)] shadow-[var(--shadow-soft)]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--foreground)] text-white">
            <Code2 size={15} />
          </div>
          <div>
            <h3 className="text-[14px] font-bold">{codeLab.title || "C 语言实操"}</h3>
            <p className="text-[11px] text-[var(--muted-foreground)]">
              C 语言实验 · 手写逻辑 · 编译运行判定 · {cSnippets.length} 个任务
            </p>
          </div>
        </div>
        <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${statusClass}`}>
          {statusText}
        </span>
      </header>

      {cSnippets.length > 1 ? (
        <nav className="flex gap-1 overflow-x-auto border-b border-[var(--border)] px-3 py-2">
          {cSnippets.map((item, index) => (
            <button
              key={index}
              type="button"
              onClick={() => setActiveIdx(index)}
              className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-[12px] font-semibold transition ${
                index === activeIdx
                  ? "bg-[var(--foreground)] text-white"
                  : "text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
              }`}
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/18 text-[10px]">
                {index + 1}
              </span>
              {item.title}
            </button>
          ))}
        </nav>
      ) : null}

      <div className="border-b border-[var(--border)] bg-[var(--muted)]/38 px-4 py-3">
        <p className="text-[12px] font-semibold text-[var(--foreground)]">任务说明</p>
        <p className="mt-1 text-[13px] leading-6 text-[var(--foreground)]/76">
          {snippet.description || "阅读任务，补全 TODO 处的真实 C 逻辑，让程序输出符合期望。"}
        </p>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0">
          <div className="flex bg-[#15161f]">
            <div
              className="line-numbers select-none overflow-hidden py-4 pl-3 pr-2 text-right font-mono text-[12px] leading-[22px]"
              style={{ width: 44 }}
            >
              {Array.from({ length: lineCount }, (_, index) => (
                <div key={index} className="text-slate-500">{index + 1}</div>
              ))}
            </div>

            <div className="relative flex-1">
              <pre
                className="pointer-events-none absolute inset-0 overflow-hidden py-4 pr-4 font-mono text-[12px] leading-[22px]"
                aria-hidden="true"
              >
                {highlighted.map((line, index) => (
                  <div key={index} dangerouslySetInnerHTML={{ __html: line || "&nbsp;" }} />
                ))}
              </pre>
              <textarea
                ref={textareaRef}
                value={editing}
                onChange={(event) => {
                  setEditing(event.target.value);
                  setCheckedOnce(false);
                  setRunResult(null);
                  setRunError(null);
                  setCoach(null);
                  setCoachError(null);
                }}
                onScroll={handleScroll}
                className="relative z-10 block w-full resize-none bg-transparent py-4 pr-4 font-mono text-[12px] leading-[22px] text-transparent caret-white outline-none"
                rows={Math.min(22, Math.max(12, lineCount + 2))}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] bg-[var(--card-solid)] px-3 py-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCheck}
                disabled={checking}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-[12px] font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
              >
                {checking ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                检查代码
              </button>
              <button
                onClick={handleReset}
                className="flex items-center gap-1 rounded-lg px-2.5 py-2 text-[11px] text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
              >
                <RotateCcw size={11} />
                重置
              </button>
            </div>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 rounded-lg px-2 py-2 text-[11px] text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
            >
              <Copy size={11} />
              {copied ? "已复制" : "复制代码"}
            </button>
          </div>
        </div>

        <aside className="space-y-4 border-t border-[var(--border)] bg-[var(--card)] p-4 lg:border-l lg:border-t-0">
          {/* 测试输入 */}
          <section>
            <p className="mb-1.5 text-[12px] font-bold">测试输入</p>
            <pre className="overflow-auto whitespace-pre-wrap rounded-lg bg-[var(--muted)]/60 px-3 py-2 font-mono text-[11px] leading-5 text-[var(--foreground)]/80">
              {snippet.test_input ? snippet.test_input : "无（变量在代码内固定）"}
            </pre>
          </section>

          {/* 期望输出 */}
          {snippet.expected_output ? (
            <section>
              <p className="mb-1.5 text-[12px] font-bold">期望输出</p>
              <pre className="overflow-auto whitespace-pre-wrap rounded-lg bg-[var(--muted)]/60 px-3 py-2 font-mono text-[11px] leading-5 text-[var(--foreground)]/80">
                {snippet.expected_output}
              </pre>
            </section>
          ) : null}

          {/* 检查点（逻辑判定） */}
          <section>
            <p className="mb-2 text-[12px] font-bold">检查点</p>
            {snippet.checkpoints && snippet.checkpoints.length ? (
              <div className="space-y-2">
                {snippet.checkpoints.map((cp, index) => {
                  const pass = logicPassed;
                  const pending = !checkedOnce || (!logicPassed && !runResult);
                  return (
                    <div
                      key={index}
                      className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-[12px] ${
                        pass
                          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                          : pending
                            ? "border-[var(--border)] bg-[var(--card-solid)] text-[var(--foreground)]/72"
                            : "border-rose-200 bg-rose-50 text-rose-800"
                      }`}
                    >
                      {pass ? (
                        <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-600" />
                      ) : pending ? (
                        <div className="mt-1 h-3 w-3 shrink-0 rounded-full border-2 border-[var(--muted-foreground)]/30" />
                      ) : (
                        <AlertCircle size={14} className="mt-0.5 shrink-0 text-rose-500" />
                      )}
                      <span>{cp.label}</span>
                      {pass ? <span className="ml-auto shrink-0 text-[10px] font-semibold">逻辑通过</span> : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-[11px] text-[var(--muted-foreground)]">本任务未配置检查点。</p>
            )}
          </section>

          {/* 提示 */}
          {snippet.hints && snippet.hints.length ? (
            <section>
              <p className="mb-2 text-[12px] font-bold">提示</p>
              <div className="space-y-2">
                {snippet.hints.slice(0, 3).map((hint, index) => (
                  <p key={index} className="rounded-lg bg-[var(--muted)]/60 px-3 py-2 text-[12px] leading-5">
                    {hint}
                  </p>
                ))}
              </div>
            </section>
          ) : null}
        </aside>
      </div>

      <RunPanel
        checkedOnce={checkedOnce}
        checking={checking}
        gate={gate}
        runError={runError}
        runResult={runResult}
        logicPassed={logicPassed}
      />

      {coachable && (
        <CoachPanel
          coach={coach}
          coaching={coaching}
          coachError={coachError}
          onCoach={handleCoach}
        />
      )}

      {codeLab.practice_tasks?.length ? (
        <div className="border-t border-[var(--border)] bg-[var(--muted)]/30 px-4 py-3">
          <p className="mb-2 text-[11px] font-semibold text-[var(--muted-foreground)]">练习目标</p>
          <ul className="space-y-1">
            {codeLab.practice_tasks.map((task, index) => (
              <li key={index} className="flex items-start gap-2 text-[12px] leading-5">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--muted-foreground)]" />
                <span>{task}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

// ── 运行结果面板 ────────────────────────────────────────────────────

function RunPanel({
  checkedOnce,
  checking,
  gate,
  runError,
  runResult,
  logicPassed,
}: {
  checkedOnce: boolean;
  checking: boolean;
  gate: StructGate;
  runError: string | null;
  runResult: CodeLabRunResult | null;
  logicPassed: boolean;
}) {
  if (!checkedOnce || checking) return null;

  // 结构门未过 / 网络错误
  if (runError || !runResult) {
    return (
      <OutputBox tone="warn" title="还不能判定">
        <pre className="whitespace-pre-wrap font-mono text-[12px] leading-5 text-amber-200">
          {runError ?? "请先补全代码。"}
        </pre>
      </OutputBox>
    );
  }

  // 逻辑通过
  if (logicPassed) {
    return (
      <OutputBox tone="ok" title="逻辑通过">
        <pre className="whitespace-pre-wrap font-mono text-[12px] leading-5 text-emerald-300">
          {`> 程序实际输出与期望一致，逻辑判定通过。\n${runResult.stdout || ""}`}
        </pre>
      </OutputBox>
    );
  }

  // 输出对上了，但结构未达标（仍有 TODO / 是 printf 清单）—— 真编译真运行过，只是不算通过
  if (runResult.matched_expected === true && !gate.ok) {
    return (
      <OutputBox tone="warn" title="跑通了，但还要补全">
        <pre className="whitespace-pre-wrap font-mono text-[12px] leading-5 text-amber-200">
          {[
            "> 程序已真实编译并运行，输出与期望一致。",
            `> 但：${gate.reasons.join("；")}`,
            "> 请补全为真实逻辑后再判定通过。",
            "",
            "—— 实际输出 ——",
            runResult.stdout || "（无输出）",
          ].join("\n")}
        </pre>
      </OutputBox>
    );
  }

  // 未检测到编译器
  if (runResult.reason === "no_compiler") {
    return (
      <OutputBox tone={gate.ok ? "warn" : "fail"} title={gate.ok ? "结构检查通过（未检测到编译器）" : "代码还需要调整"}>
        <pre className="whitespace-pre-wrap font-mono text-[12px] leading-5 text-slate-300">
          {`> 未检测到 C 编译器（tcc/gcc/clang），跳过了真正的逻辑判定。\n${
            gate.ok
              ? "> 结构检查通过：TODO 已补全、含真实逻辑、不是 printf 清单。\n> 安装编译器后可做真正的逻辑验证。"
              : `> ${gate.reasons.join("；")}`
          }`}
        </pre>
      </OutputBox>
    );
  }

  // 安全护栏拦截
  if (runResult.reason === "blocked") {
    return (
      <OutputBox tone="fail" title="代码被安全护栏拦截">
        <pre className="whitespace-pre-wrap font-mono text-[12px] leading-5 text-rose-300">
          {`> 代码包含受限调用（系统命令 / 进程 / 文件 / 网络等），已拒绝运行。\n> 命中：${(runResult.matched_patterns ?? []).join(", ")}`}
        </pre>
      </OutputBox>
    );
  }

  // 超时
  if (runResult.reason === "timeout" || runResult.timed_out) {
    return (
      <OutputBox tone="fail" title="运行超时">
        <pre className="whitespace-pre-wrap font-mono text-[12px] leading-5 text-rose-300">
          {"> 程序运行超过时限，可能存在死循环。"}
        </pre>
      </OutputBox>
    );
  }

  // 编译失败
  if (runResult.reason === "compile_error") {
    return (
      <OutputBox tone="fail" title="编译失败">
        <pre className="whitespace-pre-wrap font-mono text-[12px] leading-5 text-rose-300">
          {runResult.stderr || "（无编译器错误详情）"}
        </pre>
      </OutputBox>
    );
  }

  // 跑起来了但输出不对
  return (
    <OutputBox tone="fail" title="逻辑未通过">
      <pre className="whitespace-pre-wrap font-mono text-[12px] leading-5 text-rose-300">
        {[
          "> 程序跑起来了，但输出和期望不一致。",
          ...(runResult.diff && runResult.diff.length ? runResult.diff : []),
          "",
          "—— 实际输出 ——",
          runResult.stdout || "（无输出）",
        ].join("\n")}
      </pre>
    </OutputBox>
  );
}

function OutputBox({
  tone,
  title,
  children,
}: {
  tone: "ok" | "warn" | "fail";
  title: string;
  children: React.ReactNode;
}) {
  const headClass =
    tone === "ok"
      ? "bg-emerald-50 text-emerald-700"
      : tone === "warn"
        ? "bg-amber-50 text-amber-800"
        : "bg-rose-50 text-rose-700";
  const Icon = tone === "ok" ? CheckCircle2 : AlertCircle;
  return (
    <div className="border-t border-[var(--border)]">
      <div className={`flex items-center gap-2 px-4 py-2 text-[12px] font-semibold ${headClass}`}>
        <Icon size={14} />
        {title}
      </div>
      <div className="flex items-start gap-2 bg-[#1f2130] px-4 py-3">
        <Terminal size={13} className="mt-0.5 shrink-0 text-slate-500" />
        {children}
      </div>
    </div>
  );
}

// ── 导师点拨：失败时显式求助，只给方向不给答案（对应简答题的「导师点评」） ──────────
function CoachPanel({
  coach,
  coaching,
  coachError,
  onCoach,
}: {
  coach: CodeLabCoach | null;
  coaching: boolean;
  coachError: string | null;
  onCoach: () => void;
}) {
  return (
    <div className="border-t border-[var(--border)] bg-[var(--card)] px-4 py-3">
      {!coach && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[12px] text-[var(--muted-foreground)]">
            {coachError ?? "卡住了？让导师点你一下 —— 只指方向、不直接给答案。"}
          </p>
          <button
            type="button"
            onClick={onCoach}
            disabled={coaching}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-cyan-300 bg-cyan-50 px-3 py-1.5 text-[12px] font-semibold text-cyan-700 transition hover:bg-cyan-100 disabled:opacity-60"
          >
            {coaching ? <Loader2 size={12} className="animate-spin" /> : <Lightbulb size={12} />}
            {coachError ? "再试一次" : "请导师点拨"}
          </button>
        </div>
      )}

      {coach && (
        <div className="space-y-2 rounded-xl border border-cyan-200 bg-cyan-50/60 p-3">
          <div className="flex items-center gap-1.5 text-[12px] font-semibold text-cyan-800">
            <Lightbulb size={13} />
            导师点拨
            {coach.focus ? (
              <span className="ml-1 rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-medium text-cyan-700">
                {coach.focus}
              </span>
            ) : null}
          </div>
          {coach.diagnosis ? (
            <p className="rounded-md bg-white/70 px-2.5 py-1.5 text-[12px] leading-5 text-[var(--foreground)]/85">
              <span className="font-medium">问题在哪：</span>
              {coach.diagnosis}
            </p>
          ) : null}
          {coach.hint ? (
            <p className="rounded-md bg-white/70 px-2.5 py-1.5 text-[12px] leading-5 text-cyan-900">
              <span className="font-medium">试试看：</span>
              {coach.hint}
            </p>
          ) : null}
          <p className="text-[10px] text-[var(--muted-foreground)]">
            改完代码后再点「检查代码」重新判定。
          </p>
        </div>
      )}
    </div>
  );
}
