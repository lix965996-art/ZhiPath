"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { testApiConfig, testTtsConfig, fetchModels, type TestConfigResult, type FetchModelsResult } from "@/lib/api";
import {
  loadApiConfigs,
  saveApiConfigs,
  loadTtsValues,
  saveTtsValues,
  clearAllConfigs,
  createEmptyConfig,
  URL_PRESETS,
  ALL_TASK_TYPES,
  TASK_TYPE_LABELS,
  getCredentialHealth,
  getAllCredentialHealth,
  onCredentialHealthChanged,
  updateCredentialHealth,
  clearCredentialHealth,
  type ApiConfig,
  type ApiFormat,
  type TaskType,
  type UrlPreset,
  type CredentialHealth,
} from "@/lib/credentials";
import { showError, showSuccess } from "@/components/ui/Toast";

interface CredentialSettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

// TTS 字段定义
const TTS_FIELDS = [
  { key: "XF_TTS_APPID", label: "TTS APPID", placeholder: "APPID" },
  { key: "XF_TTS_API_KEY", label: "TTS APIKey", placeholder: "APIKey" },
  { key: "XF_TTS_API_SECRET", label: "TTS APISecret", placeholder: "APISecret" },
];

export function CredentialSettingsPanel({ open, onClose }: CredentialSettingsPanelProps) {
  const [configs, setConfigs] = useState<ApiConfig[]>([]);
  const [ttsValues, setTtsValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // TTS 测试状态
  const [ttsTesting, setTtsTesting] = useState(false);
  const [ttsTestResult, setTtsTestResult] = useState<TestConfigResult | null>(null);

  // 健康状态
  const [healthMap, setHealthMap] = useState<Map<string, CredentialHealth>>(new Map());

  useEffect(() => {
    if (!open) return;
    setConfigs(loadApiConfigs());
    setTtsValues(loadTtsValues());
    setHealthMap(getAllCredentialHealth());
  }, [open]);

  // 监听健康状态变化
  useEffect(() => {
    if (!open) return;
    const unsub = onCredentialHealthChanged(() => {
      setHealthMap(getAllCredentialHealth());
    });
    return unsub;
  }, [open]);

  // ── Config 操作 ──

  const addConfig = useCallback(() => {
    setConfigs((prev) => [...prev, createEmptyConfig()]);
  }, []);

  const removeConfig = useCallback((id: string) => {
    setConfigs((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const updateConfig = useCallback((id: string, patch: Partial<ApiConfig>) => {
    setConfigs((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    );
  }, []);

  // ── 保存 ──

  const handleSave = useCallback(() => {
    setSaving(true);
    try {
      saveApiConfigs(configs);
      saveTtsValues(ttsValues);
      showSuccess(`✅ 已保存 · ${configs.filter((c) => c.apiKey).length} 个配置生效`);
    } catch (err) {
      showError(`保存失败：${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  }, [configs, ttsValues]);

  const handleClear = useCallback(() => {
    if (typeof window === "undefined") return;
    if (!window.confirm("确认清除全部 API 配置？")) return;
    clearAllConfigs();
    setConfigs([]);
    setTtsValues({});
    showSuccess("已清除全部配置");
  }, []);

  // ── TTS 测试 ──

  const handleTestTts = useCallback(async () => {
    const appid = ttsValues["XF_TTS_APPID"] ?? "";
    const apiKey = ttsValues["XF_TTS_API_KEY"] ?? "";
    const apiSecret = ttsValues["XF_TTS_API_SECRET"] ?? "";
    if (!appid || !apiKey || !apiSecret) {
      setTtsTestResult({ ok: false, reason: "请先填写全部三个字段" });
      return;
    }
    setTtsTesting(true);
    setTtsTestResult(null);
    try {
      const result = await testTtsConfig({ appid, apiKey, apiSecret });
      setTtsTestResult(result);
    } catch (err) {
      setTtsTestResult({ ok: false, reason: (err as Error).message });
    } finally {
      setTtsTesting(false);
    }
  }, [ttsValues]);

  // ── URL 预设选择 ──

  const applyUrlPreset = useCallback(
    (configId: string, preset: UrlPreset) => {
      updateConfig(configId, {
        baseUrl: preset.url,
        apiFormat: preset.format,
        name: configId === configs.find((c) => c.id === configId)?.id && !configs.find((c) => c.id === configId)?.name
          ? preset.name
          : undefined,
      });
    },
    [configs, updateConfig],
  );

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="relative max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--card-solid)] shadow-2xl">
        {/* Header */}
        <header className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-[var(--foreground)]">🔑 API 配置</h2>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
              添加 API 配置 → 填写 Key → 测试连接 → 获取模型。配置仅存浏览器 localStorage。
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

        {/* Body */}
        <div className="max-h-[60vh] space-y-4 overflow-y-auto px-6 py-5">
          {/* 配置列表 */}
          {configs.map((config) => (
            <ApiConfigCard
              key={config.id}
              config={config}
              onUpdate={updateConfig}
              onRemove={removeConfig}
              onApplyPreset={applyUrlPreset}
              health={healthMap.get(config.name) || null}
            />
          ))}

          {/* 添加按钮 */}
          <button
            type="button"
            onClick={addConfig}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[var(--border)] py-4 text-sm font-medium text-[var(--muted-foreground)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
          >
            <Plus size={16} />
            添加 API 配置
          </button>

          {/* TTS 区块 */}
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
                {TTS_FIELDS.map((f) => (
                  <div key={f.key} className="flex items-center gap-2">
                    <label className="w-28 shrink-0 text-[11px] font-medium text-[var(--foreground)]">
                      {f.label}
                    </label>
                    <input
                      type="text"
                      value={ttsValues[f.key] ?? ""}
                      onChange={(e) =>
                        setTtsValues((v) => ({ ...v, [f.key]: e.target.value }))
                      }
                      placeholder={f.placeholder}
                      autoComplete="off"
                      spellCheck={false}
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--card-solid)] px-2.5 py-1.5 font-mono text-[11px] text-[var(--foreground)] outline-none placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary)]"
                    />
                  </div>
                ))}
              </div>
              {/* TTS 测试连接 */}
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleTestTts}
                  disabled={ttsTesting}
                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--card-solid)] px-3 py-1.5 text-[11px] font-medium text-[var(--foreground)] transition hover:bg-[var(--muted)] disabled:opacity-50"
                >
                  {ttsTesting ? <Loader2 size={12} className="animate-spin" /> : "测试连接"}
                </button>
                {ttsTestResult && (
                  <span
                    className={`inline-flex items-center gap-1 text-[11px] ${
                      ttsTestResult.ok ? "text-emerald-600" : "text-rose-600"
                    }`}
                  >
                    {ttsTestResult.ok ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
                    {ttsTestResult.ok ? "连接成功" : ttsTestResult.reason}
                  </span>
                )}
              </div>
            </div>
          </section>
        </div>

        {/* Footer */}
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
              {saving ? "保存中…" : "保存全部"}
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  );
}


// ── 子组件：单个 API 配置卡片 ──────────────────────────────────

interface ApiConfigCardProps {
  config: ApiConfig;
  onUpdate: (id: string, patch: Partial<ApiConfig>) => void;
  onRemove: (id: string) => void;
  onApplyPreset: (id: string, preset: UrlPreset) => void;
  health: CredentialHealth | null;
}

function ApiConfigCard({ config, onUpdate, onRemove, onApplyPreset, health }: ApiConfigCardProps) {
  const [showKey, setShowKey] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showUrlDropdown, setShowUrlDropdown] = useState(false);
  const [urlFilter, setUrlFilter] = useState("");

  // 测试
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestConfigResult | null>(null);

  // 模型
  const [fetchingModels, setFetchingModels] = useState(false);
  const [fetchedModels, setFetchedModels] = useState<string[]>([]);
  const [fetchError, setFetchError] = useState("");

  // 任务类型
  const [showTasks, setShowTasks] = useState(false);

  const id = config.id;

  // ── 测试连接 ──
  const handleTest = useCallback(async () => {
    if (!config.apiKey || !config.baseUrl) {
      setTestResult({ ok: false, reason: "请先填写 API Key 和 URL" });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testApiConfig({
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
        model: config.model,
        apiFormat: config.apiFormat,
      });
      setTestResult(result);
      // 更新健康状态
      if (result.ok) {
        updateCredentialHealth(config.name, "healthy");
      } else {
        updateCredentialHealth(config.name, "unknown", undefined, result.reason);
      }
    } catch (err) {
      setTestResult({ ok: false, reason: (err as Error).message });
      updateCredentialHealth(config.name, "unknown", undefined, (err as Error).message);
    } finally {
      setTesting(false);
    }
  }, [config]);

  // ── 获取模型列表 ──
  const handleFetchModels = useCallback(async () => {
    if (!config.apiKey || !config.baseUrl) {
      setFetchError("请先填写 API Key 和 URL");
      return;
    }
    setFetchingModels(true);
    setFetchError("");
    try {
      const result: FetchModelsResult = await fetchModels({
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
        apiFormat: config.apiFormat,
      });
      if (result.ok && result.models.length > 0) {
        setFetchedModels(result.models);
        if (!config.model) {
          onUpdate(id, { model: result.models[0] });
        }
      } else {
        setFetchError(result.reason || "未获取到模型");
      }
    } catch (err) {
      setFetchError((err as Error).message);
    } finally {
      setFetchingModels(false);
    }
  }, [config, id, onUpdate]);

  // ── URL 预设过滤 ──
  const filteredPresets = urlFilter
    ? URL_PRESETS.filter(
        (p) =>
          p.name.toLowerCase().includes(urlFilter.toLowerCase()) ||
          p.url.toLowerCase().includes(urlFilter.toLowerCase()),
      )
    : URL_PRESETS;

  // ── 任务类型切换 ──
  const toggleTask = useCallback(
    (task: TaskType) => {
      const current = config.taskTypes;
      if (current.includes(task)) {
        if (current.length > 1) {
          onUpdate(id, { taskTypes: current.filter((t) => t !== task) });
        }
      } else {
        onUpdate(id, { taskTypes: [...current, task] });
      }
    },
    [config.taskTypes, id, onUpdate],
  );

  const selectAllTasks = useCallback(() => {
    onUpdate(id, { taskTypes: [...ALL_TASK_TYPES] });
  }, [id, onUpdate]);

  const isAllTasks = config.taskTypes.length === ALL_TASK_TYPES.length;

  // 健康状态显示
  const healthBadge = health ? {
    healthy: { label: "正常", className: "bg-emerald-50 text-emerald-700", icon: "✅" },
    rate_limited: { label: "限流", className: "bg-amber-50 text-amber-700", icon: "⚠️" },
    auth_error: { label: "认证失败", className: "bg-rose-50 text-rose-700", icon: "❌" },
    connection_error: { label: "连接失败", className: "bg-rose-50 text-rose-700", icon: "🔌" },
    unknown: { label: "未知", className: "bg-slate-100 text-slate-500", icon: "❓" },
  }[health.status] : null;

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3">
      {/* Header: 名称 + 删除 */}
      <div className="mb-2 flex items-center justify-between gap-2">
        <input
          type="text"
          value={config.name}
          onChange={(e) => onUpdate(id, { name: e.target.value })}
          placeholder="配置名称（如 DeepSeek 主账号）"
          className="flex-1 rounded-lg border border-transparent bg-transparent px-1 text-sm font-semibold text-[var(--foreground)] outline-none hover:border-[var(--border)] focus:border-[var(--primary)]"
        />
        <div className="flex items-center gap-2">
          {healthBadge && (
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${healthBadge.className}`}
              title={health?.message || ""}
            >
              {healthBadge.icon} {healthBadge.label}
            </span>
          )}
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
              config.enabled
                ? "bg-emerald-50 text-emerald-700"
                : "bg-slate-100 text-slate-500"
            }`}
          >
            {config.enabled ? "启用" : "停用"}
          </span>
          <button
            type="button"
            onClick={() => onRemove(id)}
            className="rounded-lg p-1 text-[var(--muted-foreground)] hover:bg-rose-50 hover:text-rose-600"
            title="删除此配置"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* API Format 选择 */}
      <div className="mb-2 flex gap-2">
        <button
          type="button"
          onClick={() => onUpdate(id, { apiFormat: "openai" })}
          className={`flex-1 rounded-xl border p-2 text-center text-[12px] font-medium transition ${
            config.apiFormat === "openai"
              ? "border-[var(--primary)] bg-[rgba(59,130,246,0.06)] text-[var(--primary)]"
              : "border-[var(--border)] text-[var(--muted-foreground)] hover:border-gray-300"
          }`}
        >
          OpenAI 兼容
        </button>
        <button
          type="button"
          onClick={() => onUpdate(id, { apiFormat: "anthropic" })}
          className={`flex-1 rounded-xl border p-2 text-center text-[12px] font-medium transition ${
            config.apiFormat === "anthropic"
              ? "border-[var(--primary)] bg-[rgba(59,130,246,0.06)] text-[var(--primary)]"
              : "border-[var(--border)] text-[var(--muted-foreground)] hover:border-gray-300"
          }`}
        >
          Anthropic
        </button>
      </div>

      {/* API Key */}
      <div className="mb-2 flex items-center gap-2">
        <div className="relative flex-1">
          <input
            type={showKey ? "text" : "password"}
            value={config.apiKey}
            onChange={(e) => onUpdate(id, { apiKey: e.target.value })}
            placeholder="API Key"
            autoComplete="off"
            spellCheck={false}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--card-solid)] px-3 py-2 pr-10 font-mono text-xs text-[var(--foreground)] outline-none placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary)]"
          />
          <button
            type="button"
            onClick={() => setShowKey(!showKey)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
          >
            {showKey ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
        </div>
        <button
          type="button"
          onClick={handleTest}
          disabled={testing || !config.apiKey}
          className="rounded-xl border border-[var(--border)] bg-[var(--card-solid)] px-3 py-2 text-[11px] font-medium text-[var(--foreground)] transition hover:bg-[var(--muted)] disabled:opacity-50"
        >
          {testing ? <Loader2 size={12} className="animate-spin" /> : "测试连接"}
        </button>
      </div>

      {/* URL (带下拉预设) */}
      <div className="mb-2 relative">
        <div className="flex items-center gap-1">
          <input
            type="text"
            value={config.baseUrl}
            onChange={(e) => onUpdate(id, { baseUrl: e.target.value })}
            onFocus={() => {
              setShowUrlDropdown(true);
              setUrlFilter(config.baseUrl);
            }}
            onBlur={() => {
              // 延迟关闭，让点击事件可以触发
              setTimeout(() => setShowUrlDropdown(false), 200);
            }}
            placeholder={
              config.apiFormat === "openai"
                ? "https://api.openai.com/v1"
                : "https://api.anthropic.com"
            }
            autoComplete="off"
            spellCheck={false}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--card-solid)] px-3 py-2 font-mono text-xs text-[var(--foreground)] outline-none placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary)]"
          />
          <button
            type="button"
            onClick={() => setShowUrlDropdown(!showUrlDropdown)}
            className="shrink-0 rounded-lg border border-[var(--border)] bg-[var(--card-solid)] px-2 py-2 text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
          >
            <ChevronDown size={12} />
          </button>
        </div>

        {/* URL 下拉预设 */}
        {showUrlDropdown && filteredPresets.length > 0 && (
          <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-48 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--card-solid)] shadow-lg">
            {filteredPresets.map((preset) => (
              <button
                key={preset.url}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onApplyPreset(id, preset);
                  setShowUrlDropdown(false);
                }}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-[11px] hover:bg-[var(--muted)]"
              >
                <span className="font-medium text-[var(--foreground)]">{preset.name}</span>
                <span className="font-mono text-[var(--muted-foreground)]">{preset.url}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 模型 */}
      <div className="mb-2 flex items-center gap-2">
        <input
          type="text"
          value={config.model}
          onChange={(e) => onUpdate(id, { model: e.target.value })}
          placeholder={
            config.apiFormat === "anthropic"
              ? "claude-sonnet-4-20250514"
              : "deepseek-chat"
          }
          autoComplete="off"
          spellCheck={false}
          className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--card-solid)] px-3 py-2 font-mono text-xs text-[var(--foreground)] outline-none placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary)]"
        />
        {/* 模型下拉选择 */}
        <select
          value=""
          onChange={(e) => {
            if (e.target.value) onUpdate(id, { model: e.target.value });
          }}
          disabled={fetchedModels.length === 0}
          className="max-w-[160px] rounded-xl border border-[var(--border)] bg-[var(--card-solid)] px-2 py-2 text-[11px] text-[var(--foreground)] outline-none disabled:opacity-40"
        >
          <option value="">
            {fetchedModels.length > 0 ? `${fetchedModels.length} 个模型…` : "获取模型"}
          </option>
          {fetchedModels.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>

      {/* 获取模型按钮 + 模型获取结果 */}
      <div className="mb-2 flex items-center gap-2">
        <button
          type="button"
          onClick={handleFetchModels}
          disabled={fetchingModels || !config.apiKey || !config.baseUrl}
          className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2.5 py-1 text-[10px] font-medium text-[var(--foreground)] transition hover:bg-[var(--muted)] disabled:opacity-50"
        >
          {fetchingModels ? (
            <Loader2 size={11} className="animate-spin" />
          ) : (
            <RefreshCw size={11} />
          )}
          {fetchingModels ? "获取中…" : "获取模型列表"}
        </button>
        {fetchedModels.length > 0 && (
          <span className="text-[10px] text-emerald-600">
            ✓ 已获取 {fetchedModels.length} 个模型
          </span>
        )}
        {fetchError && (
          <span className="text-[10px] text-rose-600">{fetchError}</span>
        )}
      </div>

      {/* 折叠：任务类型 + 启用开关 */}
      <button
        type="button"
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="flex items-center gap-1 text-[11px] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
      >
        <ChevronDown
          size={12}
          className={`transform transition ${showAdvanced ? "" : "-rotate-90"}`}
        />
        高级设置
      </button>

      {showAdvanced && (
        <div className="mt-2 space-y-3 rounded-xl border border-dashed border-[var(--border)] bg-[var(--card-solid)] p-2.5">
          {/* 启用开关 */}
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-[var(--foreground)]">启用此配置</span>
            <button
              type="button"
              onClick={() => onUpdate(id, { enabled: !config.enabled })}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                config.enabled ? "bg-[var(--primary)]" : "bg-gray-300"
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform ${
                  config.enabled ? "translate-x-[18px]" : "translate-x-[3px]"
                }`}
              />
            </button>
          </div>

          {/* 任务类型 */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[11px] font-medium text-[var(--muted-foreground)]">用于任务类型</span>
              <button
                type="button"
                onClick={selectAllTasks}
                className={`text-[10px] font-medium ${
                  isAllTasks ? "text-[var(--muted-foreground)]" : "text-[var(--primary)]"
                }`}
              >
                {isAllTasks ? "已全选" : "全选"}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {ALL_TASK_TYPES.map((task) => {
                const active = config.taskTypes.includes(task);
                return (
                  <button
                    key={task}
                    type="button"
                    onClick={() => toggleTask(task)}
                    className={`rounded-lg border px-2 py-1 text-[10px] font-medium transition ${
                      active
                        ? "border-[var(--primary)] bg-[rgba(59,130,246,0.08)] text-[var(--primary)]"
                        : "border-[var(--border)] text-[var(--muted-foreground)] hover:border-gray-400"
                    }`}
                  >
                    {TASK_TYPE_LABELS[task]}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 测试结果 */}
      {testResult && (
        <div
          className={`mt-2 flex items-start gap-1.5 rounded-lg px-2 py-1 text-[11px] ${
            testResult.ok
              ? "bg-emerald-50 text-emerald-700"
              : "bg-rose-50 text-rose-700"
          }`}
        >
          {testResult.ok ? (
            <CheckCircle2 size={12} className="mt-0.5 shrink-0" />
          ) : (
            <AlertCircle size={12} className="mt-0.5 shrink-0" />
          )}
          <span className="break-all">
            {testResult.ok ? `连接成功${testResult.preview ? ` · ${testResult.preview}` : ""}` : testResult.reason}
          </span>
        </div>
      )}
    </div>
  );
}
