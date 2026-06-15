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

const TOKEN_KEY = "zhipath-auth-token";

function setAuthCookie(token: string | null) {
  if (typeof document === "undefined") return;
  if (token) {
    document.cookie = `${TOKEN_KEY}=${token}; path=/; max-age=${7 * 24 * 3600}; SameSite=Lax`;
  } else {
    document.cookie = `${TOKEN_KEY}=; path=/; max-age=0`;
  }
}

export interface AuthUser {
  id: string;
  username: string;
  created_at: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isLoggedIn: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ── API helpers（独立于 api.ts，避免循环依赖） ──────────────────

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "";

async function authFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API_BASE}${path}`, init);
}

async function authFetchWithToken(
  path: string,
  token: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${token}`,
    },
  });
}

// ── 配置同步 ──────────────────────────────────────────────────

async function syncConfigsOnLogin(token: string): Promise<void> {
  try {
    // 读取当前 localStorage 中的配置
    let localConfigs: unknown[] = [];
    let localTts: Record<string, string> = {};
    try {
      const rawConfigs = localStorage.getItem("zhipath-api-configs-v2");
      if (rawConfigs) localConfigs = JSON.parse(rawConfigs);
      const rawTts = localStorage.getItem("zhipath-tts-v1");
      if (rawTts) localTts = JSON.parse(rawTts);
    } catch {
      // ignore
    }

    // 调用 sync 端点
    const resp = await authFetchWithToken(
      "/api/v1/user/configs/sync",
      token,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ configs: localConfigs, tts: localTts }),
      },
    );

    if (!resp.ok) return;

    const data = await resp.json();
    const serverConfigs = data.configs || [];
    const serverTts = data.tts || {};

    // 用服务端配置覆盖 localStorage
    localStorage.setItem("zhipath-api-configs-v2", JSON.stringify(serverConfigs));
    if (Object.keys(serverTts).length > 0) {
      localStorage.setItem("zhipath-tts-v1", JSON.stringify(serverTts));
    } else {
      // 服务端无 TTS 配置时，清除客户端旧值，避免残留
      localStorage.removeItem("zhipath-tts-v1");
    }

    // 通知其他组件配置已更新
    window.dispatchEvent(new CustomEvent("zhipath-creds-changed"));
  } catch (err) {
    console.warn("Failed to sync configs on login:", err);
  }
}

// ── Provider ──────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 启动时从 localStorage 恢复 token 并验证
  useEffect(() => {
    if (typeof window === "undefined") return;

    const savedToken = localStorage.getItem(TOKEN_KEY);
    if (!savedToken) {
      setIsLoading(false);
      return;
    }

    // 验证 token 是否仍然有效
    authFetchWithToken("/api/v1/auth/me", savedToken)
      .then((resp) => {
        if (resp.ok) {
          return resp.json().then((userData: AuthUser) => {
            setToken(savedToken);
            setUser(userData);
            setAuthCookie(savedToken); // 同步 cookie
          });
        }
        // token 无效，清除
        localStorage.removeItem(TOKEN_KEY);
        setAuthCookie(null);
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const resp = await authFetch("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.detail || "登录失败");
    }

    const data = await resp.json();
    const newToken = data.token as string;
    const userData = data.user as AuthUser;

    localStorage.setItem(TOKEN_KEY, newToken);
    setAuthCookie(newToken);
    setToken(newToken);
    setUser(userData);

    // 登录后同步 API 配置
    await syncConfigsOnLogin(newToken);
  }, []);

  const register = useCallback(async (username: string, password: string) => {
    const resp = await authFetch("/api/v1/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.detail || "注册失败");
    }

    const data = await resp.json();
    const newToken = data.token as string;
    const userData = data.user as AuthUser;

    localStorage.setItem(TOKEN_KEY, newToken);
    setAuthCookie(newToken);
    setToken(newToken);
    setUser(userData);

    // 注册后也同步（可能有之前未登录时配置的 key）
    await syncConfigsOnLogin(newToken);
  }, []);

  const logout = useCallback(async () => {
    if (token) {
      try {
        await authFetchWithToken("/api/v1/auth/logout", token, {
          method: "POST",
        });
      } catch {
        // 忽略登出请求的错误
      }
    }
    localStorage.removeItem(TOKEN_KEY);
    setAuthCookie(null);
    setToken(null);
    setUser(null);
  }, [token]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      isLoggedIn: !!user,
      isLoading,
      login,
      register,
      logout,
    }),
    [user, token, isLoading, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    // 无 Provider 时返回默认值（SSR 安全）
    return {
      user: null,
      token: null,
      isLoggedIn: false,
      isLoading: false,
      login: async () => {},
      register: async () => {},
      logout: async () => {},
    };
  }
  return ctx;
}
