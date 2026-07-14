import { REQUEST_TIMEOUT_MS } from './endpoints.js';
import type { PluginSettings } from './types.js';

/** Error thrown when pear-desktop API returns a non-2xx status */
export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * REST client for pear-desktop API Server.
 * Implements the real auth flow: POST /auth/{clientId} returns { accessToken }.
 * All subsequent /api/* calls use Authorization: Bearer <accessToken>.
 * Volume should NEVER be read-modify-write via REST (bug #4458).
 */
export class ApiClient {
  private baseUrl = '';
  private accessToken = '';
  private fetchFn: typeof fetch;

  constructor(fetchFn: typeof fetch = globalThis.fetch) {
    this.fetchFn = fetchFn;
  }

  /** Set the target host and port */
  setBaseUrl(host: string, port: number): void {
    this.baseUrl = `http://${host}:${port}`;
  }

  /** Set the access token from the auth flow */
  setToken(token: string): void {
    this.accessToken = token;
  }

  /**
   * Authenticate with pear-desktop API Server.
   * Calls POST /auth/{clientId} — pear-desktop shows a dialog to the user.
   * On approval, returns { accessToken: "<jwt>" }.
   * The returned token is used as Bearer token for all /api/* calls.
   */
  async authenticate(clientId: string): Promise<string> {
    const url = `${this.baseUrl}/auth/${encodeURIComponent(clientId)}`;
    const response = await this.fetchFn(url, { method: 'POST' });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new ApiError(
        `Auth failed: ${response.status} ${text}`,
        response.status,
      );
    }

    const body = (await response.json()) as { accessToken: string };
    return body.accessToken;
  }

  /** Perform a GET request with timeout and retry */
  async get(path: string): Promise<Response> {
    return this.requestWithRetry('GET', path);
  }

  /** Perform a POST request with timeout and retry */
  async post(path: string, body?: unknown): Promise<Response> {
    const bodyStr = body ? JSON.stringify(body) : undefined;
    return this.requestWithRetry('POST', path, bodyStr);
  }

  // ─── Convenience methods — match real pear-desktop API Server endpoints ────

  togglePlay(): Promise<Response> {
    return this.post('/api/v1/toggle-play');
  }

  next(): Promise<Response> {
    return this.post('/api/v1/next');
  }

  previous(): Promise<Response> {
    return this.post('/api/v1/previous');
  }

  like(): Promise<Response> {
    return this.post('/api/v1/like');
  }

  dislike(): Promise<Response> {
    return this.post('/api/v1/dislike');
  }

  shuffle(): Promise<Response> {
    return this.post('/api/v1/shuffle');
  }

  /** Switch repeat mode: 0=off, 1=one, 2=all */
  switchRepeat(iteration: number): Promise<Response> {
    return this.post('/api/v1/switch-repeat', { iteration });
  }

  /** Set absolute volume (0–100). Never reads current volume (bug #4458). */
  setVolume(volume: number): Promise<Response> {
    return this.post('/api/v1/volume', { volume });
  }

  toggleMute(): Promise<Response> {
    return this.post('/api/v1/toggle-mute');
  }

  /** Seek to absolute position in seconds. */
  seekTo(seconds: number): Promise<Response> {
    return this.post('/api/v1/seek-to', { seconds });
  }

  /** Get current song info. */
  getSong(): Promise<Response> {
    return this.get('/api/v1/song');
  }

  // ─── Private helpers ───────────────────────────────────────────────

  private async requestWithRetry(
    method: string,
    path: string,
    body?: string,
    attempt = 1,
  ): Promise<Response> {
    const maxRetries = 2;

    try {
      const response = await this.request(method, path, body);

      if (response.status === 401) {
        // 401 is never retried — the token is invalid
        throw new ApiError(
          'Unauthorized: check your access token',
          response.status,
        );
      }

      if (!response.ok && response.status >= 400) {
        const text = await response.text().catch(() => '');
        throw new ApiError(
          `Request failed: ${response.status} ${text}`,
          response.status,
        );
      }

      return response;
    } catch (err) {
      if (
        err instanceof ApiError &&
        err.status === 401
      ) {
        throw err; // Never retry 401
      }

      if (attempt < maxRetries) {
        return this.requestWithRetry(method, path, body, attempt + 1);
      }

      throw err;
    }
  }

  private async request(
    method: string,
    path: string,
    body?: string,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const url = `${this.baseUrl}${path}`;
      const headers: Record<string, string> = {};

      if (this.accessToken) {
        headers['Authorization'] = `Bearer ${this.accessToken}`;
      }

      if (body) {
        headers['Content-Type'] = 'application/json';
      }

      const response = await this.fetchFn(url, {
        method,
        headers,
        body,
        signal: controller.signal,
      });

      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

/** Singleton API client instance */
export const apiClient = new ApiClient();
