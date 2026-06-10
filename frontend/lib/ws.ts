import { onCredentialsChanged, pushCredentialsToWS } from "@/lib/credentials";

type EventHandler = (data: Record<string, unknown>) => void;

export class ZhiPathWS {
  private ws: WebSocket | null = null;
  private url: string;
  private handlers: Map<string, EventHandler[]> = new Map();
  private messageQueue: string[] = [];
  private reconnectAttempts = 0;
  /** 取消上限，无限重连。延迟由 maxReconnectDelayMs 兜底。 */
  private reconnectBaseMs = 150;
  private maxReconnectDelayMs = 8000;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect = true;
  private credsUnsub: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
  }

  connect(): void {
    if (
      this.ws?.readyState === WebSocket.OPEN ||
      this.ws?.readyState === WebSocket.CONNECTING
    ) {
      return;
    }

    this.shouldReconnect = true;
    // 不在此重置 reconnectAttempts，让 tryReconnect 的退避正常生长
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      // 连上立刻推送一次浏览器凭据（如果用户已配置）
      pushCredentialsToWS((data) => this.sendRaw(data));
      // 监听凭据变化，自动重推（用户改 Key 后下条消息就生效）
      this.credsUnsub?.();
      this.credsUnsub = onCredentialsChanged(() => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          pushCredentialsToWS((data) => this.sendRaw(data));
        }
      });
      this.flushQueue();
      this.startHeartbeat();
      this.emit("open", {});
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const type = data.type || "message";
        this.emit(type, data);
      } catch {
        this.emit("message", { raw: event.data });
      }
    };

    this.ws.onclose = () => {
      this.stopHeartbeat();
      this.emit("close", {});
      if (this.shouldReconnect) {
        this.tryReconnect();
      }
    };

    this.ws.onerror = (event) => {
      this.emit("error", { content: "WebSocket 连接错误", event });
    };
  }

  send(data: Record<string, unknown>): void {
    const payload = JSON.stringify(data);

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(payload);
      return;
    }

    this.messageQueue.push(payload);
    this.connect();
  }

  /** 立即发送（不入队，给凭据推送用）。 */
  private sendRaw(data: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  on(type: string, handler: EventHandler): void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, []);
    }
    this.handlers.get(type)!.push(handler);
  }

  off(type: string, handler: EventHandler): void {
    const handlers = this.handlers.get(type);
    if (handlers) {
      const idx = handlers.indexOf(handler);
      if (idx >= 0) handlers.splice(idx, 1);
    }
  }

  disconnect(): void {
    this.shouldReconnect = false;
    this.stopHeartbeat();
    this.cancelReconnect();
    this.credsUnsub?.();
    this.credsUnsub = null;
    this.messageQueue = [];
    this.ws?.close();
    this.ws = null;
  }

  private emit(type: string, data: Record<string, unknown>): void {
    this.handlers.get(type)?.forEach((handler) => handler(data));
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    // 心跳 30s → 15s。掉线感知更快。
    this.heartbeatInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: "ping" }));
      }
    }, 15000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private cancelReconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  private flushQueue(): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;

    while (this.messageQueue.length > 0) {
      const payload = this.messageQueue.shift();
      if (payload) {
        this.ws.send(payload);
      }
    }
  }

  private tryReconnect(): void {
    this.reconnectAttempts++;
    // 指数退避封顶 maxReconnectDelayMs，无上限尝试
    const rawDelay = this.reconnectBaseMs * Math.pow(2, this.reconnectAttempts - 1);
    const delay = Math.min(rawDelay, this.maxReconnectDelayMs);
    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      this.connect();
    }, delay);
  }
}
