/**
 * 浏览器 LLM 凭据管理：
 * - 存到 localStorage（只在你本机生效，别人看不到）
 * - HTTP 请求自动注入 X-LF-* header
 * - WebSocket 连接后立刻发送 init 消息把凭据告诉后端
 *
 * 后端用 contextvars 把凭据绑定到"当前请求"范围，请求结束自动释放，
 * 永不写盘、永不写日志。
 */

const STORAGE_KEY = "zhipath-credentials-v1";

// 支持的凭据 env_var 名（与后端 SUPPORTED_KEYS 一致）
// 每个 LLM 服务三件套：API_KEY + BASE_URL（可选）+ MODEL（可选）
export const SUPPORTED_CRED_KEYS = [
  // LLM API Keys
  "DEEPSEEK_API_KEY",
  "DASHSCOPE_API_KEY",
  "SILICONFLOW_API_KEY",
  "XF_SPARK_API_PASSWORD",
  // LLM Base URL Overrides
  "DEEPSEEK_BASE_URL",
  "DASHSCOPE_BASE_URL",
  "SILICONFLOW_BASE_URL",
  "XF_SPARK_BASE_URL",
  // LLM Model Overrides
  "DEEPSEEK_MODEL",
  "DASHSCOPE_MODEL",
  "SILICONFLOW_MODEL",
  "XF_SPARK_MODEL",
  // 通用 OpenAI 兼容提供商
  "OPENAI_COMPAT_API_KEY",
  "OPENAI_COMPAT_BASE_URL",
  "OPENAI_COMPAT_MODEL",
  // 通用 Anthropic 提供商
  "ANTHROPIC_COMPAT_API_KEY",
  "ANTHROPIC_COMPAT_BASE_URL",
  "ANTHROPIC_COMPAT_MODEL",
  // 讯飞 TTS
  "XF_TTS_APPID",
  "XF_TTS_API_KEY",
  "XF_TTS_API_SECRET",
] as const;

export type CredentialKey = (typeof SUPPORTED_CRED_KEYS)[number];

export type CredentialMap = Partial<Record<CredentialKey, string>>;

// env_var → 发给后端的 header name
const HEADER_NAME: Record<CredentialKey, string> = {
  DEEPSEEK_API_KEY: "X-LF-Deepseek-Key",
  DASHSCOPE_API_KEY: "X-LF-Dashscope-Key",
  SILICONFLOW_API_KEY: "X-LF-Siliconflow-Key",
  XF_SPARK_API_PASSWORD: "X-LF-Xf-Spark-Password",
  DEEPSEEK_BASE_URL: "X-LF-Deepseek-Base-Url",
  DASHSCOPE_BASE_URL: "X-LF-Dashscope-Base-Url",
  SILICONFLOW_BASE_URL: "X-LF-Siliconflow-Base-Url",
  XF_SPARK_BASE_URL: "X-LF-Xf-Spark-Base-Url",
  DEEPSEEK_MODEL: "X-LF-Deepseek-Model",
  DASHSCOPE_MODEL: "X-LF-Dashscope-Model",
  SILICONFLOW_MODEL: "X-LF-Siliconflow-Model",
  XF_SPARK_MODEL: "X-LF-Xf-Spark-Model",
  OPENAI_COMPAT_API_KEY: "X-LF-Openai-Compat-Key",
  OPENAI_COMPAT_BASE_URL: "X-LF-Openai-Compat-Base-Url",
  OPENAI_COMPAT_MODEL: "X-LF-Openai-Compat-Model",
  ANTHROPIC_COMPAT_API_KEY: "X-LF-Anthropic-Compat-Key",
  ANTHROPIC_COMPAT_BASE_URL: "X-LF-Anthropic-Compat-Base-Url",
  ANTHROPIC_COMPAT_MODEL: "X-LF-Anthropic-Compat-Model",
  XF_TTS_APPID: "X-LF-Xf-Tts-Appid",
  XF_TTS_API_KEY: "X-LF-Xf-Tts-Api-Key",
  XF_TTS_API_SECRET: "X-LF-Xf-Tts-Api-Secret",
};

// ---- localStorage 读写 ----

export function loadCredentials(): CredentialMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    const out: CredentialMap = {};
    for (const k of SUPPORTED_CRED_KEYS) {
      const v = parsed?.[k];
      if (typeof v === "string" && v.trim()) {
        out[k] = v.trim();
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function saveCredentials(creds: CredentialMap): void {
  if (typeof window === "undefined") return;
  const clean: CredentialMap = {};
  for (const k of SUPPORTED_CRED_KEYS) {
    const v = creds[k];
    if (typeof v === "string" && v.trim()) {
      clean[k] = v.trim();
    }
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
  // 触发同 tab 内监听者刷新
  window.dispatchEvent(new CustomEvent("zhipath-creds-changed"));
}

export function clearCredentials(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new CustomEvent("zhipath-creds-changed"));
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

// ---- 注入到 fetch / WebSocket ----

/** 把当前 localStorage 中的凭据转成 fetch headers。 */
export function credentialsToHeaders(): Record<string, string> {
  const creds = loadCredentials();
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(creds)) {
    if (!v) continue;
    const header = HEADER_NAME[k as CredentialKey];
    if (header) out[header] = v;
  }
  return out;
}

/** 把 fetch headers 和当前凭据合并。 */
export function withCredentials(headers?: HeadersInit): HeadersInit {
  const credHeaders = credentialsToHeaders();
  const base = new Headers(headers);
  for (const [k, v] of Object.entries(credHeaders)) base.set(k, v);
  return base;
}

/** 给已经连接好的 WebSocket 发送 init 凭据消息。 */
export function pushCredentialsToWS(send: (data: Record<string, unknown>) => void): void {
  const creds = loadCredentials();
  if (Object.keys(creds).length === 0) return;
  send({ type: "init", credentials: creds });
}
