import type { ConnectionState } from './types.js';
import { PROBE_TIMEOUT_MS, DEFAULT_HOST, DEFAULT_PORT } from './endpoints.js';
import type { ApiClient } from './api-client.js';
import type { WsClient } from './ws-client.js';

type StateListener = (state: ConnectionState) => void;

/**
 * Manages connection lifecycle to pear-desktop API Server.
 *
 * Simplified flow (no auth — "No authorization" mode):
 *   1. connect(host, port) → probe TCP/HTTP reachability
 *   2. Probe OK → state 'authenticated' + start WebSocket
 *   3. Probe fails → state 'disconnected'
 */
export class ConnectionManager {
  private apiClient: ApiClient;
  private wsClient: WsClient;
  private state: ConnectionState = 'disconnected';
  private listeners = new Set<StateListener>();
  private probeTimer: ReturnType<typeof setTimeout> | null = null;
  private currentHost = DEFAULT_HOST;
  private currentPort = DEFAULT_PORT;

  constructor(apiClient: ApiClient, wsClient: WsClient) {
    this.apiClient = apiClient;
    this.wsClient = wsClient;
  }

  /** Get the current connection state */
  getState(): ConnectionState {
    return this.state;
  }

  /** Check if authenticated and ready for commands */
  isAuthenticated(): boolean {
    return this.state === 'authenticated';
  }

  /**
   * Initiate connection: probe the host/port to verify reachability.
   * On success, transitions directly to 'authenticated' and starts WebSocket.
   */
  connect(host: string, port: number): void {
    this.currentHost = host;
    this.currentPort = port;

    this.apiClient.setBaseUrl(host, port);

    this.transition('connecting');
    this.startProbe();
  }

  /** Disconnect WebSocket and reset to disconnected state */
  disconnect(): void {
    this.clearProbe();
    this.wsClient.disconnect();
    this.transition('disconnected');
  }

  /** Subscribe to state changes. Returns an unsubscribe function. */
  onStateChange(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  // ─── Private ────────────────────────────────────────────────────────

  private transition(newState: ConnectionState): void {
    if (this.state === newState) return;
    this.state = newState;
    this.notify(newState);
  }

  private notify(state: ConnectionState): void {
    for (const listener of this.listeners) {
      try {
        listener(state);
      } catch {
        // Per-action error boundary: one listener failing
        // should not prevent others from receiving state updates
      }
    }
  }

  private startProbe(): void {
    this.clearProbe();

    const probeUrl = `http://${this.currentHost}:${this.currentPort}/`;
    const controller = new AbortController();

    this.probeTimer = setTimeout(() => {
      controller.abort();
      // Probe timed out — pear is unreachable
      this.transition('disconnected');
    }, PROBE_TIMEOUT_MS);

    fetch(probeUrl, { signal: controller.signal })
      .then(() => {
        this.clearProbe();
        this.transition('authenticated');
        this.startWsConnection();
      })
      .catch(() => {
        this.clearProbe();
        // Probe failed — pear is unreachable
        this.transition('disconnected');
      });
  }

  private startWsConnection(): void {
    const wsUrl = `ws://${this.currentHost}:${this.currentPort}`;

    this.wsClient.onReconnect = (_delay: number) => {
      this.transition('connecting');
    };

    this.wsClient.connect(wsUrl);
  }

  private clearProbe(): void {
    if (this.probeTimer !== null) {
      clearTimeout(this.probeTimer);
      this.probeTimer = null;
    }
  }
}

/** Singleton connection manager — created at plugin boot */
export let connectionManager: ConnectionManager;

export function initConnectionManager(
  apiClient: ApiClient,
  wsClient: WsClient,
): ConnectionManager {
  connectionManager = new ConnectionManager(apiClient, wsClient);
  return connectionManager;
}
