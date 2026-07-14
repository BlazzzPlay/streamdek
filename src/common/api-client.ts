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
 * REST client for pear-desktop API.
 * Handles JWT Bearer auth, 5s timeout, single retry on network errors.
 * Volume should NEVER be read-modify-write via REST (bug #4458).
 */
export class ApiClient {
  private baseUrl = '';
  private jwt = '';
  private fetchFn: typeof fetch;

  constructor(fetchFn: typeof fetch = globalThis.fetch) {
    this.fetchFn = fetchFn;
  }

  /** Set the target host and port */
  setBaseUrl(host: string, port: number): void {
    this.baseUrl = `http://${host}:${port}`;
  }

  /** Set the JWT token for authentication */
  setJwt(token: string): void {
    this.jwt = token;
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

  /** Perform a PUT request with timeout and retry */
  async put(path: string, body?: unknown): Promise<Response> {
    const bodyStr = body ? JSON.stringify(body) : undefined;
    return this.requestWithRetry('PUT', path, bodyStr);
  }

  // ─── Convenience methods ────────────────────────────────────────────

  playPause(): Promise<Response> {
    return this.post('/api/v1/play-pause');
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

  repeat(): Promise<Response> {
    return this.post('/api/v1/repeat');
  }

  /** Set absolute volume (0–100). Never reads current volume (bug #4458). */
  setVolume(volume: number): Promise<Response> {
    return this.put('/api/v1/volume', { volume });
  }

  /** Seek to absolute position in seconds. */
  seek(position: number): Promise<Response> {
    return this.post('/api/v1/seek', { position });
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
          'Unauthorized: check your JWT token',
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
      const headers: Record<string, string> = {
        Authorization: `Bearer ${this.jwt}`,
      };

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
