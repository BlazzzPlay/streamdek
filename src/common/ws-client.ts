import type { WsEventType, WsEventHandler } from './types.js';

/** Backoff sequence for reconnect: 1s → 2s → 4s → 8s → 16s → 32s → 60s cap */
const BACKOFF_SEQUENCE = [1000, 2000, 4000, 8000, 16000, 32000, 60000];

/**
 * WebSocket client for pear-desktop communication.
 * Sends JWT as first frame after WS open.
 * Typed event pub/sub for player state events.
 * Exponential backoff reconnect capped at 60s, reset on success.
 */
export class WsClient {
  private ws: WebSocket | null = null;
  private url = '';
  private jwt = '';
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
   * JWT is sent as the first frame after the connection opens.
   */
  connect(url: string, jwt: string): void {
    this.disposed = false;
    this.url = url;
    this.jwt = jwt;
    this.createSocket();
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

  private createSocket(): void {
    if (this.disposed) return;

    try {
      this.ws = new this.wsCtor(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.addEventListener('open', () => {
      this.failCount = 0; // Reset backoff on successful connection
      this.sendAuth();
    });

    this.ws.addEventListener('message', (event: MessageEvent) => {
      this.handleMessage(event.data);
    });

    this.ws.addEventListener('close', (_event: CloseEvent) => {
      if (!this.disposed) {
        this.scheduleReconnect();
      }
    });

    this.ws.addEventListener('error', () => {
      // Close event will fire after error, triggering reconnect
    });
  }

  private sendAuth(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'auth', token: this.jwt }));
    }
  }

  private handleMessage(raw: string): void {
    try {
      const data = JSON.parse(raw) as { type: string };
      const type = data.type as WsEventType;

      const handlers = this.listeners.get(type);
      if (handlers && handlers.size > 0) {
        for (const handler of handlers) {
          handler(data);
        }
      }
    } catch {
      // Ignore unparseable messages
    }
  }

  private scheduleReconnect(): void {
    if (this.disposed) return;

    const delay = BACKOFF_SEQUENCE[Math.min(this.failCount, BACKOFF_SEQUENCE.length - 1)];
    this.failCount++;

    if (this.onReconnect) {
      this.onReconnect(delay);
    }

    this.reconnectTimer = setTimeout(() => {
      this.createSocket();
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
