import type { WsEventType, WsEventHandler } from './types.js';
import { WS_PATH } from './endpoints.js';

/** Backoff sequence for reconnect: 1s → 2s → 4s → 8s → 16s → 32s → 60s cap */
const BACKOFF_SEQUENCE = [1000, 2000, 4000, 8000, 16000, 32000, 60000];

/**
 * WebSocket client for pear-desktop API Server communication.
 * Token is passed as a query parameter in the WS URL: /api/v1/ws?token=<jwt>
 * Typed event pub/sub for player state events.
 * Exponential backoff reconnect capped at 60s, reset on success.
 */
export class WsClient {
  private ws: WebSocket | null = null;
  private listeners = new Map<string, Set<WsEventHandler>>();
  private failCount = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private wsCtor: typeof WebSocket;

  /** Called when reconnection is about to be scheduled. Receives delay in ms. */
  onReconnect: ((delay: number) => void) | null = null;

  constructor(wsCtor: typeof WebSocket = WebSocket) {
    this.wsCtor = wsCtor;
  }

  /**
   * Connect to the WebSocket server.
   * Token is appended as a query parameter: ws://host:port/api/v1/ws?token=<token>
   */
  connect(baseUrl: string, token: string): void {
    this.disposed = false;
    const wsUrl = `${baseUrl}${WS_PATH}?token=${encodeURIComponent(token)}`;
    this.createSocket(wsUrl);
  }

  /** Close the WebSocket and stop reconnect attempts */
  disconnect(): void {
    this.disposed = true;
    this.clearReconnectTimer();
    this.listeners.clear();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /** Subscribe to typed WS events. Returns an unsubscribe function. */
  subscribe(type: WsEventType, handler: WsEventHandler): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(handler);

    return () => {
      const handlers = this.listeners.get(type);
      if (handlers) {
        handlers.delete(handler);
      }
    };
  }

  // ─── Private ────────────────────────────────────────────────────────

  private createSocket(wsUrl: string): void {
    if (this.disposed) return;

    try {
      this.ws = new this.wsCtor(wsUrl);
    } catch {
      this.scheduleReconnect(wsUrl);
      return;
    }

    this.ws.addEventListener('open', () => {
      this.failCount = 0; // Reset backoff on successful connection
    });

    this.ws.addEventListener('message', (event: MessageEvent) => {
      this.handleMessage(event.data);
    });

    this.ws.addEventListener('close', (_event: CloseEvent) => {
      if (!this.disposed) {
        this.scheduleReconnect(wsUrl);
      }
    });

    this.ws.addEventListener('error', () => {
      // Close event will fire after error, triggering reconnect
    });
  }

  private handleMessage(raw: string): void {
    try {
      const data = JSON.parse(raw) as { type: string };
      const handlers = this.listeners.get(data.type);
      if (handlers && handlers.size > 0) {
        for (const handler of handlers) {
          handler(data);
        }
      }
    } catch {
      // Ignore unparseable messages
    }
  }

  private scheduleReconnect(wsUrl: string): void {
    if (this.disposed) return;

    const delay = BACKOFF_SEQUENCE[Math.min(this.failCount, BACKOFF_SEQUENCE.length - 1)];
    this.failCount++;

    if (this.onReconnect) {
      this.onReconnect(delay);
    }

    this.reconnectTimer = setTimeout(() => {
      this.createSocket(wsUrl);
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}

/** Singleton WebSocket client instance */
export const wsClient = new WsClient();
