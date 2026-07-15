import type { ConnectionState } from './types.js';
import { PROBE_TIMEOUT_MS, DEFAULT_HOST, DEFAULT_PORT } from './endpoints.js';
import type { ApiClient } from './api-client.js';
import type { WsClient } from './ws-client.js';

type StateListener = (state: ConnectionState) => void;

/**
 * Manages connection lifecycle to pear-desktop API Server.
 *
 * Flow:
 *   1. connect(host, port) → probe TCP/HTTP reachability
 *   2. Probe OK → state 'connected'
 *   3. authenticate(clientId) → POST /auth/{clientId}
 *      a. pear-desktop shows user a dialog
 *      b. User clicks Allow → returns { accessToken }
 *      c. Stores token, transitions to 'authenticated'
 *   4. Start WebSocket for real-time events
 */
export class ConnectionManager {
  private apiClient: ApiClient;
  private wsClient: WsClient;
  private state: ConnectionState = 'disconnected';
  private listeners = new Set<StateListener>();
  private probeTimer: ReturnType<typeof setTimeout> | null = null;
  private currentHost = DEFAULT_HOST;
  private currentPort = DEFAULT_PORT;
  private currentToken = '';
  private useAuth = false;

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
   * Does NOT perform authentication — call authenticate() after probe succeeds.
   * @param useAuth — when false, authenticate() skips the API call and goes straight to 'authenticated'.
   */
  connect(host: string, port: number, useAuth = false): void {
    this.currentHost = host;
    this.currentPort = port;
    this.useAuth = useAuth;

    this.apiClient.setBaseUrl(host, port);

    this.transition('connecting');
    this.startProbe();
  }

  /**
   * Authenticate with pear-desktop using the API Server auth flow.
   * When useAuth is false, skips the API call and transitions directly to 'authenticated'.
   * When useAuth is true, calls POST /auth/{clientId} — user sees a dialog in pear-desktop.
   * On success, stores the access token and starts the WebSocket connection.
   */
  async authenticate(clientId: string): Promise<void> {
    if (!this.useAuth) {
      this.currentToken = '';
      this.apiClient.setToken('');
      this.transition('authenticated');
      this.startWsConnection();
      return;
    }

    this.transition('waiting_for_auth');

    try {
      const token = await this.apiClient.authenticate(clientId);
      this.currentToken = token;
      this.apiClient.setToken(token);
      this.transition('authenticated');
      this.startWsConnection();
    } catch {
      this.transition('disconnected');
    }
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
        this.transition('connected');
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

    this.wsClient.connect(wsUrl, this.currentToken);
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
