/**
 * 浏览器 API 配置管理（简化版）：
 * - ApiConfig[] 存到 localStorage
 * - TTS 凭据独立存储
 * - HTTP 请求自动注入 X-LF-Configs / X-LF-TTS header
 * - WebSocket 连接后发送 init 消息
 */

// ── 类型定义 ──────────────────────────────────────────────────

export type ApiFormat = "openai" | "anthropic";

export type TaskType = "chat" | "structured" | "reasoning" | "code" | "long_form" | "mermaid";

export const ALL_TASK_TYPES: TaskType[] = [
  "chat", "structured", "reasoning", "code", "long_form", "mermaid",
];

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  chat: "聊天",
  structured: "结构化输出",
  reasoning: "推理",
  code: "代码",
  long_form: "长文本",
  mermaid: "图表生成",
};

export interface ApiConfig {
  id: string;
  name: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  apiFormat: ApiFormat;
  taskTypes: TaskType[];
  enabled: boolean;
}

export function createEmptyConfig(): ApiConfig {
  return {
    id: crypto.randomUUID(),
    name: "",
    apiKey: "",
    baseUrl: "",
    model: "",
    apiFormat: "openai",
    taskTypes: [...ALL_TASK_TYPES],
    enabled: true,
  };
}

// ── URL 预设 ──────────────────────────────────────────────────

export interface UrlPreset {
  name: string;
  url: string;
  format: ApiFormat;
}

export const URL_PRESETS: UrlPreset[] = [
  { name: "DeepSeek", url: "https://api.deepseek.com", format: "openai" },
  { name: "OpenAI", url: "https://api.openai.com/v1", format: "openai" },
  { name: "Anthropic", url: "https://api.anthropic.com", format: "anthropic" },
  { name: "通义千问 (DashScope)", url: "https://dashscope.aliyuncs.com/compatible-mode/v1", format: "openai" },
  { name: "硅基流动 (SiliconFlow)", url: "https://api.siliconflow.cn/v1", format: "openai" },
  { name: "讯飞星火", url: "https://spark-api-open.xf-yun.com/v1", format: "openai" },
  { name: "Groq", url: "https://api.groq.com/openai/v1", format: "openai" },
  { name: "Together", url: "https://api.together.xyz/v1", format: "openai" },
  { name: "本地 Ollama", url: "http://localhost:11434/v1", format: "openai" },
];

// ── localStorage 读写 ──────────────────────────────────────────

const CONFIGS_KEY = "zhipath-api-configs-v2";
const TTS_KEY = "zhipath-tts-v1";

// 旧 key，用于迁移
const OLD_V1_KEY = "zhipath-credentials-v1";
const OLD_V1_KEYS = [
  "DEEPSEEK_API_KEY", "DASHSCOPE_API_KEY", "SILICONFLOW_API_KEY", "XF_SPARK_API_PASSWORD",
  "DEEPSEEK_BASE_URL", "DASHSCOPE_BASE_URL", "SILICONFLOW_BASE_URL", "XF_SPARK_BASE_URL",
  "DEEPSEEK_MODEL", "DASHSCOPE_MODEL", "SILICONFLOW_MODEL", "XF_SPARK_MODEL",
  "OPENAI_COMPAT_API_KEY", "OPENAI_COMPAT_BASE_URL", "OPENAI_COMPAT_MODEL",
  "ANTHROPIC_COMPAT_API_KEY", "ANTHROPIC_COMPAT_BASE_URL", "ANTHROPIC_COMPAT_MODEL",
] as const;

const OLD_V1_PROVIDER_MAP: Array<{
  apiKeyVar: string;
  baseUrlVar: string;
  modelVar: string;
  name: string;
  defaultUrl: string;
  format: ApiFormat;
  defaultModel: string;
}> = [
  { apiKeyVar: "DEEPSEEK_API_KEY", baseUrlVar: "DEEPSEEK_BASE_URL", modelVar: "DEEPSEEK_MODEL", name: "DeepSeek", defaultUrl: "https://api.deepseek.com", format: "openai", defaultModel: "deepseek-chat" },
  { apiKeyVar: "DASHSCOPE_API_KEY", baseUrlVar: "DASHSCOPE_BASE_URL", modelVar: "DASHSCOPE_MODEL", name: "通义千问", defaultUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", format: "openai", defaultModel: "qwen-plus" },
  { apiKeyVar: "SILICONFLOW_API_KEY", baseUrlVar: "SILICONFLOW_BASE_URL", modelVar: "SILICONFLOW_MODEL", name: "硅基流动", defaultUrl: "https://api.siliconflow.cn/v1", format: "openai", defaultModel: "deepseek-ai/DeepSeek-V3" },
  { apiKeyVar: "XF_SPARK_API_PASSWORD", baseUrlVar: "XF_SPARK_BASE_URL", modelVar: "XF_SPARK_MODEL", name: "讯飞星火", defaultUrl: "https://spark-api-open.xf-yun.com/v1", format: "openai", defaultModel: "4.0Ultra" },
  { apiKeyVar: "OPENAI_COMPAT_API_KEY", baseUrlVar: "OPENAI_COMPAT_BASE_URL", modelVar: "OPENAI_COMPAT_MODEL", name: "OpenAI 兼容", defaultUrl: "https://api.openai.com/v1", format: "openai", defaultModel: "gpt-4o" },
  { apiKeyVar: "ANTHROPIC_COMPAT_API_KEY", baseUrlVar: "ANTHROPIC_COMPAT_BASE_URL", modelVar: "ANTHROPIC_COMPAT_MODEL", name: "Anthropic", defaultUrl: "https://api.anthropic.com", format: "anthropic", defaultModel: "claude-sonnet-4-5-20250514" },
];


function loadOldV1(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(OLD_V1_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}


function migrateFromV1(): ApiConfig[] {
  const old = loadOldV1();
  if (!old || Object.keys(old).length === 0) return [];

  const configs: ApiConfig[] = [];
  for (const provider of OLD_V1_PROVIDER_MAP) {
    const apiKey = old[provider.apiKeyVar];
    if (!apiKey) continue;
    configs.push({
      id: crypto.randomUUID(),
      name: provider.name,
      apiKey,
      baseUrl: old[provider.baseUrlVar] || provider.defaultUrl,
      model: old[provider.modelVar] || provider.defaultModel,
      apiFormat: provider.format,
      taskTypes: [...ALL_TASK_TYPES],
      enabled: true,
    });
  }

  return configs;
}


export function loadApiConfigs(): ApiConfig[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(CONFIGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }

    // 尝试从 v1 迁移
    const migrated = migrateFromV1();
    if (migrated.length > 0) {
      saveApiConfigs(migrated);
      // 同时迁移 TTS
      const old = loadOldV1();
      const tts: Record<string, string> = {};
      if (old.XF_TTS_APPID) tts.XF_TTS_APPID = old.XF_TTS_APPID;
      if (old.XF_TTS_API_KEY) tts.XF_TTS_API_KEY = old.XF_TTS_API_KEY;
      if (old.XF_TTS_API_SECRET) tts.XF_TTS_API_SECRET = old.XF_TTS_API_SECRET;
      if (Object.keys(tts).length > 0) saveTtsValues(tts);
      // 删除旧 key
      window.localStorage.removeItem(OLD_V1_KEY);
      return migrated;
    }

    return [];
  } catch {
    return [];
  }
}


export function saveApiConfigs(configs: ApiConfig[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CONFIGS_KEY, JSON.stringify(configs));
  window.dispatchEvent(new CustomEvent("zhipath-creds-changed"));
  _syncToServer();
}


// ── TTS 存储 ──────────────────────────────────────────────────

export function loadTtsValues(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(TTS_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}


export function saveTtsValues(values: Record<string, string>): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TTS_KEY, JSON.stringify(values));
  window.dispatchEvent(new CustomEvent("zhipath-creds-changed"));
  _syncToServer();
}


// ── 全局操作 ──────────────────────────────────────────────────

export function clearAllConfigs(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(CONFIGS_KEY);
  window.localStorage.removeItem(TTS_KEY);
  window.localStorage.removeItem(OLD_V1_KEY);
  window.dispatchEvent(new CustomEvent("zhipath-creds-changed"));
  _syncToServer();
}


export function onCredentialsChanged(cb: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const handler = () => cb();
  window.addEventListener("zhipath-creds-changed", handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener("zhipath-creds-changed", handler);
    window.removeEventListener("storage", handler);
  };
}


// ── 健康状态管理 ──────────────────────────────────────────────

export type HealthStatus = "healthy" | "rate_limited" | "auth_error" | "connection_error" | "unknown";

export interface CredentialHealth {
  status: HealthStatus;
  timestamp: number;
  errorCode?: number;
  message?: string;
}

/** 内存中的健康状态存储（按 config source 名称索引） */
const _healthStore: Map<string, CredentialHealth> = new Map();

/** 5 分钟后自动清除错误状态 */
const HEALTH_TTL_MS = 5 * 60 * 1000;

/** 获取指定 source 的健康状态 */
export function getCredentialHealth(source: string): CredentialHealth | null {
  const entry = _healthStore.get(source);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > HEALTH_TTL_MS) {
    _healthStore.delete(source);
    return null;
  }
  return entry;
}

/** 获取所有健康状态 */
export function getAllCredentialHealth(): Map<string, CredentialHealth> {
  const now = Date.now();
  for (const [key, entry] of _healthStore) {
    if (now - entry.timestamp > HEALTH_TTL_MS) {
      _healthStore.delete(key);
    }
  }
  return new Map(_healthStore);
}

/** 更新健康状态（由 WebSocket 事件调用） */
export function updateCredentialHealth(
  source: string,
  status: HealthStatus,
  errorCode?: number,
  message?: string,
): void {
  _healthStore.set(source, {
    status,
    timestamp: Date.now(),
    errorCode,
    message,
  });
  window.dispatchEvent(new CustomEvent("zhipath-health-changed", { detail: { source } }));
}

/** 清除指定 source 的健康状态 */
export function clearCredentialHealth(source: string): void {
  _healthStore.delete(source);
  window.dispatchEvent(new CustomEvent("zhipath-health-changed", { detail: { source } }));
}

/** 监听健康状态变化 */
export function onCredentialHealthChanged(cb: (source: string) => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const handler = (e: Event) => cb((e as CustomEvent).detail?.source ?? "");
  window.addEventListener("zhipath-health-changed", handler);
  return () => window.removeEventListener("zhipath-health-changed", handler);
}


// ── 注入到 fetch / WebSocket ──────────────────────────────────

/** 把当前配置转成 fetch headers。 */
export function credentialsToHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};

  const configs = loadApiConfigs();
  if (configs.length > 0) {
    headers["X-LF-Configs"] = JSON.stringify(configs);
  }

  const tts = loadTtsValues();
  if (Object.keys(tts).length > 0) {
    headers["X-LF-TTS"] = JSON.stringify(tts);
  }

  return headers;
}


/** 合并凭据 headers。 */
export function withCredentials(headers?: HeadersInit): HeadersInit {
  const credHeaders = credentialsToHeaders();
  const base = new Headers(headers);
  for (const [k, v] of Object.entries(credHeaders)) base.set(k, v);
  return base;
}


/** 给 WebSocket 发送 init 消息。 */
export function pushCredentialsToWS(send: (data: Record<string, unknown>) => void): void {
  const configs = loadApiConfigs();
  const tts = loadTtsValues();
  const token = typeof window !== "undefined" ? localStorage.getItem("zhipath-auth-token") : null;
  const msg: Record<string, unknown> = { type: "init", configs, tts };
  if (token) msg.token = token;
  send(msg);
}


// ── 服务端同步（登录后自动保存配置） ──────────────────────────

let _syncTimer: ReturnType<typeof setTimeout> | null = null;

/** 防抖同步：配置变更后 500ms 内只发一次请求。 */
function _syncToServer(): void {
  if (typeof window === "undefined") return;
  const token = localStorage.getItem("zhipath-auth-token");
  if (!token) return; // 未登录，不同步

  if (_syncTimer) clearTimeout(_syncTimer);
  _syncTimer = setTimeout(() => {
    const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "";
    const configs = loadApiConfigs();
    const tts = loadTtsValues();

    fetch(`${API_BASE}/api/v1/user/configs`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ configs, tts }),
    }).catch((err) => {
      console.warn("Failed to sync configs to server:", err);
    });
  }, 500);
}
