import { REQUEST_TIMEOUT_MS } from './endpoints.js';

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
 * No authorization mode — all /api/* calls are sent without Authorization header.
 * Volume should NEVER be read-modify-write via REST (bug #4458).
 */
export class ApiClient {
  private baseUrl = '';
  private fetchFn: typeof fetch;

  constructor(fetchFn: typeof fetch = globalThis.fetch) {
    this.fetchFn = fetchFn;
  }

  /** Set the target host and port */
  setBaseUrl(host: string, port: number): void {
    this.baseUrl = `http://${host}:${port}`;
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

  /** Skip forward by configured seconds. */
  goForward(seconds: number): Promise<Response> {
    return this.post('/api/v1/go-forward', { seconds });
  }

  /** Skip backward by configured seconds. */
  goBack(seconds: number): Promise<Response> {
    return this.post('/api/v1/go-back', { seconds });
  }

  /** Add a track to the queue. */
  addTrack(videoId: string, forcePlay = false): Promise<Response> {
    const body: Record<string, unknown> = { videoId };
    if (forcePlay) body.forcePlay = true;
    return this.post('/api/v1/queue', body);
  }

  /** Add a playlist to the queue. */
  addPlaylist(playlistId: string, forcePlay = false, shuffle = false): Promise<Response> {
    const body: Record<string, unknown> = { playlistId };
    if (forcePlay) body.forcePlay = true;
    if (shuffle) body.shuffle = true;
    return this.post('/api/v1/queue', body);
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

      if (!response.ok && response.status >= 400) {
        const text = await response.text().catch(() => '');
        throw new ApiError(
          `Request failed: ${response.status} ${text}`,
          response.status,
        );
      }

      return response;
    } catch (err) {
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
