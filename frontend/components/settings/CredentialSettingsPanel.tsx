"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Globe,
  Loader2,
  RefreshCw,
  Save,
  Server,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import {
  getCredentialStatus,
  testCredentialKey,
  fetchModels,
  getSettingsCustomLlm,
  saveSettingsCustomLlm,
  type CredentialStatusItem,
} from "@/lib/api";
import {
  clearCredentials,
  loadCredentials,
  saveCredentials,
  SUPPORTED_CRED_KEYS,
  type CredentialKey,
} from "@/lib/credentials";
import { showError, showSuccess } from "@/components/ui/Toast";

interface CredentialSettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

/** API 格式 */
type ApiFormat = "openai" | "anthropic";

/** 一个 LLM 服务的配置 */
interface LLMService {
  id: string;
  label: string;
  group: string;
  apiKeyVar: CredentialKey;
  baseUrlVar: CredentialKey;
  modelVar: CredentialKey;
  defaultBaseUrl: string;
  defaultModel: string;
  apiFormat: ApiFormat;
  signupUrl?: string;
  hint: string;
}

const LLM_SERVICES: LLMService[] = [
  {
    id: "deepseek",
    label: "DeepSeek",
    group: "国内 LLM",
    apiKeyVar: "DEEPSEEK_API_KEY",
    baseUrlVar: "DEEPSEEK_BASE_URL",
    modelVar: "DEEPSEEK_MODEL",
    defaultBaseUrl: "https://api.deepseek.com",
    defaultModel: "deepseek-chat",
    apiFormat: "openai",
    signupUrl: "https://platform.deepseek.com/api_keys",
    hint: "主用 LLM。OpenAI 兼容协议，动态拉取最新模型。",
  },
  {
    id: "dashscope",
    label: "通义千问 (DashScope)",
    group: "国内 LLM",
    apiKeyVar: "DASHSCOPE_API_KEY",
    baseUrlVar: "DASHSCOPE_BASE_URL",
    modelVar: "DASHSCOPE_MODEL",
    defaultBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    defaultModel: "qwen-plus",
    apiFormat: "openai",
    signupUrl: "https://bailian.console.aliyun.com/?apiKey=1",
    hint: "阿里云百炼平台，OpenAI 兼容协议。",
  },
  {
    id: "siliconflow",
    label: "硅基流动 (SiliconFlow)",
    group: "国内 LLM",
    apiKeyVar: "SILICONFLOW_API_KEY",
    baseUrlVar: "SILICONFLOW_BASE_URL",
    modelVar: "SILICONFLOW_MODEL",
    defaultBaseUrl: "https://api.siliconflow.cn/v1",
    defaultModel: "deepseek-ai/DeepSeek-V3",
    apiFormat: "openai",
    signupUrl: "https://cloud.siliconflow.cn/account/ak",
    hint: "聚合平台：智谱 / 月之暗面 / DeepSeek / 通义等。",
  },
  {
    id: "xf_spark",
    label: "讯飞星火 (Spark)",
    group: "国内 LLM",
    apiKeyVar: "XF_SPARK_API_PASSWORD",
    baseUrlVar: "XF_SPARK_BASE_URL",
    modelVar: "XF_SPARK_MODEL",
    defaultBaseUrl: "https://spark-api-open.xf-yun.com/v1",
    defaultModel: "4.0Ultra",
    apiFormat: "openai",
    signupUrl: "https://www.xfyun.cn/services/cbm",
    hint: "讯飞星火大模型，OpenAI 兼容协议。",
  },
  {
    id: "openai_compat",
    label: "OpenAI 兼容 (自定义)",
    group: "通用 LLM",
    apiKeyVar: "OPENAI_COMPAT_API_KEY",
    baseUrlVar: "OPENAI_COMPAT_BASE_URL",
    modelVar: "OPENAI_COMPAT_MODEL",
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o",
    apiFormat: "openai",
    hint: "任意 OpenAI 兼容端点：OpenAI / Groq / Together / 中转站等。",
  },
  {
    id: "anthropic_compat",
    label: "Anthropic (Claude)",
    group: "通用 LLM",
    apiKeyVar: "ANTHROPIC_COMPAT_API_KEY",
    baseUrlVar: "ANTHROPIC_COMPAT_BASE_URL",
    modelVar: "ANTHROPIC_COMPAT_MODEL",
    defaultBaseUrl: "https://api.anthropic.com",
    defaultModel: "claude-sonnet-4-5-20250514",
    apiFormat: "anthropic",
    signupUrl: "https://console.anthropic.com/settings/keys",
    hint: "Anthropic Claude 系列。动态拉取最新模型列表。",
  },
];

// 讯飞 TTS 三件套
const TTS_FIELDS = [
  { key: "XF_TTS_APPID" as CredentialKey, label: "TTS APPID", placeholder: "APPID" },
  { key: "XF_TTS_API_KEY" as CredentialKey, label: "TTS APIKey", placeholder: "APIKey" },
  { key: "XF_TTS_API_SECRET" as CredentialKey, label: "TTS APISecret", placeholder: "APISecret" },
];

export function CredentialSettingsPanel({ open, onClose }: CredentialSettingsPanelProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [status, setStatus] = useState<CredentialStatusItem[]>([]);
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; reason: string }>>({});
  const [saving, setSaving] = useState(false);

  // 动态模型列表：{ providerId: string[] }
  const [fetchedModels, setFetchedModels] = useState<Record<string, string[]>>({});
  const [fetchingModels, setFetchingModels] = useState<Record<string, boolean>>({});
  const [fetchError, setFetchError] = useState<Record<string, string>>({});

  // ─ 自定义 LLM 端点 ──
  const [customLlm, setCustomLlm] = useState({
    enabled: false,
    base_url: "",
    api_key: "",
    model_name: "",
    api_format: "openai" as "openai" | "anthropic" | "custom",
  });
  const [showCustomKey, setShowCustomKey] = useState(false);
  const [savingCustom, setSavingCustom] = useState(false);
  const [showCustomAdvanced, setShowCustomAdvanced] = useState(false);
  const [fetchedCustomModels, setFetchedCustomModels] = useState<string[]>([]);
  const [fetchingCustomModels, setFetchingCustomModels] = useState(false);
  const [fetchCustomModelsError, setFetchCustomModelsError] = useState("");

  const CUSTOM_API_FORMATS = [
    { value: "openai" as const, label: "OpenAI 兼容", description: "标准 /v1/chat/completions 接口" },
    { value: "anthropic" as const, label: "Anthropic", description: "Claude 系列 API" },
    { value: "custom" as const, label: "自定义", description: "非标准端点" },
  ];

  // 打开时加载已保存值 + 后端状态 + 自定义 LLM 配置
  useEffect(() => {
    if (!open) return;
    const stored = loadCredentials();
    const initial: Record<string, string> = {};
    for (const k of SUPPORTED_CRED_KEYS) initial[k] = stored[k] ?? "";
    setValues(initial);
    setRevealed({});
    setExpanded({});
    setTestResults({});
    setFetchedModels({});
    setFetchError({});
    getCredentialStatus()
      .then((s) => setStatus(s.items))
      .catch(() => undefined);
    getSettingsCustomLlm()
      .then((c) => {
        setCustomLlm({
          enabled: c.enabled,
          base_url: c.base_url || "",
          api_key: c.api_key || "",
          model_name: c.model_name || "",
          api_format: c.api_format || "openai",
        });
      })
      .catch(() => undefined);
  }, [open]);

  const statusByKey = useMemo(() => {
    const map = new Map<string, CredentialStatusItem>();
    for (const s of status) map.set(s.key, s);
    return map;
  }, [status]);

  const handleSave = useCallback(() => {
    setSaving(true);
    try {
      const clean: Record<string, string> = {};
      for (const k of SUPPORTED_CRED_KEYS) {
        const v = values[k];
        if (typeof v === "string" && v.trim()) clean[k] = v.trim();
      }
      saveCredentials(clean as Partial<Record<CredentialKey, string>>);
      showSuccess(`✅ 已保存到本浏览器 · ${Object.keys(clean).length} 项配置生效`);
      getCredentialStatus()
        .then((s) => setStatus(s.items))
        .catch(() => undefined);
    } catch (err) {
      showError(`保存失败：${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  }, [values]);

  const handleClear = useCallback(() => {
    if (typeof window === "undefined") return;
    if (!window.confirm("确认清除本浏览器内全部 API Key / Base URL / 模型配置？")) return;
    clearCredentials();
    setValues({});
    showSuccess("已清除本浏览器全部凭据");
    getCredentialStatus()
      .then((s) => setStatus(s.items))
      .catch(() => undefined);
  }, []);

  const handleTest = useCallback(
    async (apiKeyVar: CredentialKey) => {
      const clean: Record<string, string> = {};
      for (const k of SUPPORTED_CRED_KEYS) {
        const v = values[k];
        if (typeof v === "string" && v.trim()) clean[k] = v.trim();
      }
      saveCredentials(clean as Partial<Record<CredentialKey, string>>);

      setTesting((t) => ({ ...t, [apiKeyVar]: true }));
      try {
        const result = await testCredentialKey(apiKeyVar);
        setTestResults((r) => ({
          ...r,
          [apiKeyVar]: { ok: result.ok, reason: result.reason || (result.ok ? "ok" : "未知错误") },
        }));
      } catch (err) {
        setTestResults((r) => ({
          ...r,
          [apiKeyVar]: { ok: false, reason: (err as Error).message },
        }));
      } finally {
        setTesting((t) => ({ ...t, [apiKeyVar]: false }));
      }
    },
    [values],
  );

  /** 动态拉取模型列表 */
  const handleFetchModels = useCallback(
    async (svc: LLMService) => {
      const apiKey = (values[svc.apiKeyVar] ?? "").trim();
      const baseUrl = (values[svc.baseUrlVar] ?? "").trim() || svc.defaultBaseUrl;

      if (!apiKey) {
        setFetchError((e) => ({ ...e, [svc.id]: "请先填写 API Key" }));
        return;
      }

      setFetchingModels((f) => ({ ...f, [svc.id]: true }));
      setFetchError((e) => ({ ...e, [svc.id]: "" }));

      try {
        const result = await fetchModels(apiKey, baseUrl, svc.apiFormat);
        if (result.ok && result.models.length > 0) {
          setFetchedModels((m) => ({ ...m, [svc.id]: result.models }));
          // 如果当前没有选模型，自动选第一个
          if (!values[svc.modelVar]?.trim()) {
            setValues((v) => ({ ...v, [svc.modelVar]: result.models[0] }));
          }
        } else {
          setFetchError((e) => ({
            ...e,
            [svc.id]: result.reason || `未获取到模型 (0 个)`,
          }));
        }
      } catch (err) {
        setFetchError((e) => ({ ...e, [svc.id]: (err as Error).message }));
      } finally {
        setFetchingModels((f) => ({ ...f, [svc.id]: false }));
      }
    },
    [values],
  );

  /** 保存自定义 LLM 端点 */
  const handleSaveCustomLlm = useCallback(async () => {
    if (!customLlm.base_url.trim()) {
      showError("请填写 Base URL");
      return;
    }
    setSavingCustom(true);
    try {
      await saveSettingsCustomLlm({
        enabled: customLlm.enabled,
        base_url: customLlm.base_url.trim(),
        api_key: customLlm.api_key.trim(),
        model_name: customLlm.model_name.trim(),
        api_format: customLlm.api_format,
      });
      showSuccess("自定义 LLM 端点已保存");
    } catch {
      showError("保存失败，请检查后端日志");
    } finally {
      setSavingCustom(false);
    }
  }, [customLlm]);

  /** 拉取自定义端点的模型列表 */
  const handleFetchCustomModels = useCallback(async () => {
    const apiKey = customLlm.api_key.trim();
    const baseUrl = customLlm.base_url.trim();
    if (!baseUrl) {
      setFetchCustomModelsError("请先填写 Base URL");
      return;
    }
    if (!apiKey && customLlm.api_format !== "custom") {
      setFetchCustomModelsError("请先填写 API Key");
      return;
    }
    setFetchingCustomModels(true);
    setFetchCustomModelsError("");
    try {
      const fmt = customLlm.api_format === "anthropic" ? "anthropic" : "openai";
      const result = await fetchModels(apiKey, baseUrl, fmt);
      if (result.ok && result.models.length > 0) {
        setFetchedCustomModels(result.models);
        if (!customLlm.model_name.trim()) {
          setCustomLlm((prev) => ({ ...prev, model_name: result.models[0] }));
        }
      } else {
        setFetchCustomModelsError(result.reason || "未获取到模型");
        setFetchedCustomModels([]);
      }
    } catch (err) {
      setFetchCustomModelsError((err as Error).message);
      setFetchedCustomModels([]);
    } finally {
      setFetchingCustomModels(false);
    }
  }, [customLlm]);

  if (!open) return null;

  // 按分组渲染
  const groups = [
    { title: "国内 LLM 模型 (至少配置一项)", ids: ["deepseek", "dashscope", "siliconflow", "xf_spark"] },
    { title: "通用 LLM (OpenAI / Anthropic)", ids: ["openai_compat", "anthropic_compat"] },
  ];

  return createPortal(
    <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="relative max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--card-solid)] shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-[var(--foreground)]">🔑 API Key 设置</h2>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
              配置 Key 后点击「获取模型」动态拉取可用模型列表。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
          >
            <X size={16} />
          </button>
        </header>

        <div className="flex items-start gap-2 border-b border-[var(--border)] bg-emerald-50/50 px-6 py-3 text-xs text-emerald-900">
          <ShieldCheck size={14} className="mt-0.5 shrink-0 text-emerald-700" />
          <div className="leading-5">
            <p className="font-semibold">安全说明</p>
            <p>
              所填配置只存在<strong>你这台浏览器的 localStorage</strong>，不会上传服务端硬盘。
              请求时通过 HTTP header 临时传给后端，后端用完即丢、不写日志。
            </p>
          </div>
        </div>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto px-6 py-5">
          {/* ══════ 全局自定义 LLM 端点 ══════ */}
          <section className="rounded-2xl border-2 border-dashed border-[var(--primary)] bg-[rgba(0,122,255,0.04)] p-4">
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[rgba(0,122,255,0.12)] text-[var(--primary)]">
                <Globe size={16} />
              </div>
              <div className="flex-1">
                <div className="text-[14px] font-semibold">全局自定义 LLM 端点</div>
                <div className="text-[11px] text-[var(--muted-foreground)]">
                  开启后所有 LLM 调用全部走此端点，跳过内置路由
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCustomLlm((prev) => ({ ...prev, enabled: !prev.enabled }));
                }}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  customLlm.enabled ? "bg-[var(--primary)]" : "bg-gray-300"
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform ${
                    customLlm.enabled ? "translate-x-[18px]" : "translate-x-[3px]"
                  }`}
                />
              </button>
            </div>

            {customLlm.enabled && (
              <div className="space-y-3 border-t border-[var(--border)] pt-3">
                {/* API 格式选择 */}
                <div>
                  <label className="mb-1.5 block text-[12px] font-medium">API 格式</label>
                  <div className="grid grid-cols-3 gap-2">
                    {CUSTOM_API_FORMATS.map((fmt) => (
                      <button
                        key={fmt.value}
                        type="button"
                        onClick={() => {
                          setCustomLlm((prev) => ({ ...prev, api_format: fmt.value }));
                          setFetchedCustomModels([]);
                          setFetchCustomModelsError("");
                        }}
                        className={`rounded-xl border p-2 text-left transition ${
                          customLlm.api_format === fmt.value
                            ? "border-[var(--primary)] bg-[rgba(0,122,255,0.06)] shadow-sm"
                            : "border-[var(--border)] hover:border-gray-300"
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <Server size={12} />
                          <span className="text-[12px] font-medium">{fmt.label}</span>
                        </div>
                        <div className="mt-0.5 text-[10px] text-[var(--muted-foreground)]">
                          {fmt.description}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Base URL */}
                <div>
                  <label className="mb-1 block text-[12px] font-medium">Base URL</label>
                  <input
                    type="text"
                    value={customLlm.base_url}
                    onChange={(e) => setCustomLlm((prev) => ({ ...prev, base_url: e.target.value }))}
                    placeholder={
                      customLlm.api_format === "openai"
                        ? "http://localhost:11434/v1 或 https://your-proxy.com/v1"
                        : customLlm.api_format === "anthropic"
                          ? "https://api.anthropic.com"
                          : "https://your-api-endpoint.com/chat"
                    }
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--card-solid)] px-3 py-2 text-[12px] outline-none transition focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--ring)]"
                  />
                </div>

                {/* API Key */}
                <div>
                  <label className="mb-1 block text-[12px] font-medium">API Key（可选）</label>
                  <div className="relative">
                    <input
                      type={showCustomKey ? "text" : "password"}
                      value={customLlm.api_key}
                      onChange={(e) => setCustomLlm((prev) => ({ ...prev, api_key: e.target.value }))}
                      placeholder="留空表示无需认证（如本地 Ollama）"
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--card-solid)] px-3 py-2 pr-8 text-[12px] outline-none transition focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--ring)]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCustomKey(!showCustomKey)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                    >
                      {showCustomKey ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>

                {/* 折叠的高级区：模型名 + 获取模型 */}
                <button
                  type="button"
                  onClick={() => setShowCustomAdvanced(!showCustomAdvanced)}
                  className="flex items-center gap-1 text-[11px] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                >
                  {showCustomAdvanced ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  高级（模型选择）
                </button>

                {showCustomAdvanced && (
                  <div className="space-y-2 rounded-xl border border-dashed border-[var(--border)] bg-[var(--card-solid)] p-2.5">
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-[var(--muted-foreground)]">
                        模型名称
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={customLlm.model_name}
                          onChange={(e) => setCustomLlm((prev) => ({ ...prev, model_name: e.target.value }))}
                          placeholder={
                            customLlm.api_format === "openai"
                              ? "留空则使用端点默认模型"
                              : customLlm.api_format === "anthropic"
                                ? "如 claude-sonnet-4-20250514"
                                : "必填，如 deepseek-chat"
                          }
                          className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] outline-none focus:border-[var(--primary)]"
                        />
                        <select
                          value=""
                          onChange={(e) => {
                            if (e.target.value) {
                              setCustomLlm((prev) => ({ ...prev, model_name: e.target.value }));
                            }
                          }}
                          disabled={fetchedCustomModels.length === 0}
                          className="max-w-[180px] rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-[11px] outline-none disabled:opacity-40"
                        >
                          <option value="">
                            {fetchedCustomModels.length > 0
                              ? `${fetchedCustomModels.length} 个模型…`
                              : "请先获取"}
                          </option>
                          {fetchedCustomModels.map((m) => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* 获取模型按钮 */}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleFetchCustomModels}
                        disabled={fetchingCustomModels || !customLlm.base_url.trim()}
                        className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2.5 py-1 text-[10px] font-medium text-[var(--foreground)] transition hover:bg-[var(--muted)] disabled:opacity-50"
                      >
                        {fetchingCustomModels ? (
                          <Loader2 size={11} className="animate-spin" />
                        ) : (
                          <RefreshCw size={11} />
                        )}
                        {fetchingCustomModels ? "获取中…" : "获取模型列表"}
                      </button>
                      {fetchedCustomModels.length > 0 && (
                        <span className="text-[10px] text-emerald-600">
                          ✓ 已获取 {fetchedCustomModels.length} 个模型
                        </span>
                      )}
                      {fetchCustomModelsError && (
                        <span className="text-[10px] text-rose-600">{fetchCustomModelsError}</span>
                      )}
                    </div>
                  </div>
                )}

                {/* 保存按钮 */}
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleSaveCustomLlm}
                    disabled={savingCustom || !customLlm.base_url.trim()}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--primary)] px-3 py-1.5 text-[12px] font-medium text-white shadow-sm transition hover:bg-[var(--primary-dark)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {savingCustom ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Save size={12} />
                    )}
                    保存端点配置
                  </button>
                </div>
              </div>
            )}
          </section>

          {groups.map((group) => (
            <section key={group.title}>
              <header className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
                {group.title}
              </header>
              <div className="space-y-3">
                {LLM_SERVICES.filter((s) => group.ids.includes(s.id)).map((svc) => (
                  <ProviderCard
                    key={svc.id}
                    svc={svc}
                    values={values}
                    setValues={setValues}
                    revealed={revealed}
                    setRevealed={setRevealed}
                    expanded={expanded}
                    setExpanded={setExpanded}
                    statusByKey={statusByKey}
                    testing={testing}
                    testResults={testResults}
                    fetchedModels={fetchedModels}
                    fetchingModels={fetchingModels}
                    fetchError={fetchError}
                    onTest={handleTest}
                    onFetchModels={handleFetchModels}
                  />
                ))}
              </div>
            </section>
          ))}

          <section>
            <header className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
              讯飞 TTS 语音合成（可选）
            </header>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3">
              <p className="mb-2 text-[11px] text-[var(--muted-foreground)]">
                三个一起填才生效。{" "}
                <a
                  href="https://console.xfyun.cn/services/tts"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-blue-600 hover:underline"
                >
                  去申请 →
                </a>
              </p>
              <div className="space-y-2">
                {TTS_FIELDS.map((f) => {
                  const isRevealed = revealed[f.key] ?? false;
                  return (
                    <div key={f.key} className="flex items-center gap-2">
                      <label className="w-28 shrink-0 text-[11px] font-medium text-[var(--foreground)]">
                        {f.label}
                      </label>
                      <div className="relative flex-1">
                        <input
                          type={isRevealed ? "text" : "password"}
                          value={values[f.key] ?? ""}
                          onChange={(e) =>
                            setValues((v) => ({ ...v, [f.key]: e.target.value }))
                          }
                          placeholder={f.placeholder}
                          autoComplete="off"
                          spellCheck={false}
                          className="w-full rounded-lg border border-[var(--border)] bg-[var(--card-solid)] px-2.5 py-1.5 pr-9 font-mono text-[11px] text-[var(--foreground)] outline-none placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary)]"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setRevealed((r) => ({ ...r, [f.key]: !r[f.key] }))
                          }
                          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
                        >
                          {isRevealed ? <EyeOff size={12} /> : <Eye size={12} />}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-[var(--border)] bg-[var(--card)] px-6 py-3">
          <button
            type="button"
            onClick={handleClear}
            className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-100"
          >
            <Trash2 size={12} />
            清除全部
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-[var(--border)] bg-[var(--card-solid)] px-4 py-1.5 text-xs text-[var(--foreground)] hover:bg-[var(--muted)]"
            >
              关闭
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-full bg-[var(--primary)] px-4 py-1.5 text-xs font-semibold text-white shadow hover:bg-[var(--primary-dark)] disabled:opacity-60"
            >
              {saving ? "保存中…" : "保存到本浏览器"}
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

// ── 子组件：单个 Provider 卡片 ──────────────────────────────────

interface ProviderCardProps {
  svc: LLMService;
  values: Record<string, string>;
  setValues: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  revealed: Record<string, boolean>;
  setRevealed: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  expanded: Record<string, boolean>;
  setExpanded: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  statusByKey: Map<string, CredentialStatusItem>;
  testing: Record<string, boolean>;
  testResults: Record<string, { ok: boolean; reason: string }>;
  fetchedModels: Record<string, string[]>;
  fetchingModels: Record<string, boolean>;
  fetchError: Record<string, string>;
  onTest: (apiKeyVar: CredentialKey) => Promise<void>;
  onFetchModels: (svc: LLMService) => Promise<void>;
}

function ProviderCard({
  svc,
  values,
  setValues,
  revealed,
  setRevealed,
  expanded,
  setExpanded,
  statusByKey,
  testing,
  testResults,
  fetchedModels,
  fetchingModels,
  fetchError,
  onTest,
  onFetchModels,
}: ProviderCardProps) {
  const st = statusByKey.get(svc.apiKeyVar);
  const isRevealed = revealed[svc.apiKeyVar] ?? false;
  const isExpanded = expanded[svc.id] ?? false;
  const isTesting = testing[svc.apiKeyVar] ?? false;
  const testRes = testResults[svc.apiKeyVar];
  const isFetching = fetchingModels[svc.id] ?? false;
  const models = fetchedModels[svc.id];
  const err = fetchError[svc.id];

  const formatLabel = svc.apiFormat === "anthropic" ? "Anthropic" : "OpenAI 兼容";

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3">
      <div className="mb-1 flex items-center justify-between gap-2">
        <label
          htmlFor={`cred-${svc.apiKeyVar}`}
          className="text-sm font-semibold text-[var(--foreground)]"
        >
          {svc.label}
        </label>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-700">
            {formatLabel}
          </span>
          <SourceBadge source={st?.source} />
        </div>
      </div>
      <p className="mb-2 text-[11px] text-[var(--muted-foreground)]">
        {svc.hint}
        {svc.signupUrl ? (
          <>
            {" "}
            <a
              href={svc.signupUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="text-blue-600 hover:underline"
            >
              去申请 →
            </a>
          </>
        ) : null}
      </p>

      {/* API Key 行 */}
      <div className="mb-2 flex items-center gap-2">
        <div className="relative flex-1">
          <input
            id={`cred-${svc.apiKeyVar}`}
            type={isRevealed ? "text" : "password"}
            value={values[svc.apiKeyVar] ?? ""}
            onChange={(e) =>
              setValues((v) => ({ ...v, [svc.apiKeyVar]: e.target.value }))
            }
            placeholder="API Key"
            autoComplete="off"
            spellCheck={false}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--card-solid)] px-3 py-2 pr-10 font-mono text-xs text-[var(--foreground)] outline-none placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary)]"
          />
          <button
            type="button"
            onClick={() =>
              setRevealed((r) => ({ ...r, [svc.apiKeyVar]: !r[svc.apiKeyVar] }))
            }
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
            title={isRevealed ? "隐藏" : "显示"}
          >
            {isRevealed ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
        </div>
        <button
          type="button"
          onClick={() => onTest(svc.apiKeyVar)}
          disabled={isTesting || !values[svc.apiKeyVar]}
          className="rounded-xl border border-[var(--border)] bg-[var(--card-solid)] px-3 py-2 text-[11px] font-medium text-[var(--foreground)] transition hover:bg-[var(--muted)] disabled:opacity-50"
        >
          {isTesting ? <Loader2 size={12} className="animate-spin" /> : "测试"}
        </button>
      </div>

      {/* 折叠的"高级"区：Base URL + 动态模型选择 */}
      <button
        type="button"
        onClick={() => setExpanded((e) => ({ ...e, [svc.id]: !e[svc.id] }))}
        className="flex w-full items-center gap-1 rounded-lg px-1 py-1 text-[11px] text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
      >
        {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        高级（自定义 Base URL 和模型）
      </button>

      {isExpanded ? (
        <div className="mt-2 space-y-2 rounded-xl border border-dashed border-[var(--border)] bg-[var(--card-solid)] p-2.5">
          <div>
            <label className="mb-1 block text-[11px] font-medium text-[var(--muted-foreground)]">
              Base URL（覆盖默认端点）
            </label>
            <input
              type="text"
              value={values[svc.baseUrlVar] ?? ""}
              onChange={(e) =>
                setValues((v) => ({ ...v, [svc.baseUrlVar]: e.target.value }))
              }
              placeholder={svc.defaultBaseUrl}
              autoComplete="off"
              spellCheck={false}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-2.5 py-1.5 font-mono text-[11px] text-[var(--foreground)] outline-none placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary)]"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-[var(--muted-foreground)]">
              Model（从列表选择或手动输入）
            </label>
            <div className="flex gap-1">
              <input
                type="text"
                value={values[svc.modelVar] ?? ""}
                onChange={(e) =>
                  setValues((v) => ({ ...v, [svc.modelVar]: e.target.value }))
                }
                placeholder={svc.defaultModel}
                autoComplete="off"
                spellCheck={false}
                className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2.5 py-1.5 font-mono text-[11px] text-[var(--foreground)] outline-none placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary)]"
              />
              {/* 动态模型下拉 */}
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value) {
                    setValues((v) => ({ ...v, [svc.modelVar]: e.target.value }));
                  }
                }}
                disabled={!models || models.length === 0}
                className="max-w-[180px] rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-[11px] text-[var(--foreground)] outline-none disabled:opacity-40"
              >
                <option value="">
                  {models && models.length > 0
                    ? `${models.length} 个模型…`
                    : "请先获取"}
                </option>
                {models?.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            {/* 获取模型按钮 */}
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => onFetchModels(svc)}
                disabled={isFetching || !values[svc.apiKeyVar]}
                className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2.5 py-1 text-[10px] font-medium text-[var(--foreground)] transition hover:bg-[var(--muted)] disabled:opacity-50"
              >
                {isFetching ? (
                  <Loader2 size={11} className="animate-spin" />
                ) : (
                  <RefreshCw size={11} />
                )}
                {isFetching ? "获取中…" : "获取模型列表"}
              </button>
              {models && models.length > 0 && (
                <span className="text-[10px] text-emerald-600">
                  ✓ 已获取 {models.length} 个模型
                </span>
              )}
              {err && (
                <span className="text-[10px] text-rose-600">{err}</span>
              )}
            </div>

            <p className="mt-1 text-[10px] text-[var(--muted-foreground)]">
              默认: <span className="font-mono">{svc.defaultModel}</span>
            </p>
          </div>
        </div>
      ) : null}

      {testRes ? (
        <div
          className={`mt-2 flex items-start gap-1.5 rounded-lg px-2 py-1 text-[11px] ${
            testRes.ok
              ? "bg-emerald-50 text-emerald-700"
              : "bg-rose-50 text-rose-700"
          }`}
        >
          {testRes.ok ? (
            <CheckCircle2 size={12} className="mt-0.5 shrink-0" />
          ) : (
            <AlertCircle size={12} className="mt-0.5 shrink-0" />
          )}
          <span className="break-all">{testRes.reason}</span>
        </div>
      ) : null}
    </div>
  );
}

function SourceBadge({ source }: { source?: "browser" | "env" | "missing" }) {
  if (!source) return null;
  const map = {
    browser: { label: "本浏览器", className: "bg-emerald-50 text-emerald-700" },
    env: { label: "服务端 .env", className: "bg-blue-50 text-blue-700" },
    missing: { label: "未配置", className: "bg-slate-100 text-slate-500" },
  } as const;
  const { label, className } = map[source];
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${className}`}>
      {label}
    </span>
  );
}
