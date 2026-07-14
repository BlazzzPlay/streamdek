import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ApiClient } from '../../common/api-client';
import { ENDPOINTS } from '../../common/endpoints';

/** Helper: create a mock fetch that resolves with a given status and body */
function mockFetch(
  status: number,
  body: unknown = {},
): jest.Mock<typeof fetch> {
  return jest.fn<typeof fetch>().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

/** Extract Authorization header from a fetch call */
function getAuthHeader(mock: jest.Mock): string | null {
  const call = mock.mock.calls[0];
  const init = call?.[1] as RequestInit | undefined;
  const headers = init?.headers as Record<string, string> | undefined;
  return headers?.['Authorization'] ?? null;
}

describe('ApiClient', () => {
  let client: ApiClient;
  let fetchMock: jest.Mock<typeof fetch>;

  beforeEach(() => {
    fetchMock = mockFetch(200);
    client = new ApiClient(fetchMock as unknown as typeof fetch);
    client.setBaseUrl('localhost', 26538);
    client.setJwt('test-token-123');
  });

  describe('JWT Bearer authentication', () => {
    it('should include Authorization header with Bearer token', async () => {
      await client.get('/test');

      expect(getAuthHeader(fetchMock)).toBe('Bearer test-token-123');
    });

    it('should include Authorization header on POST requests', async () => {
      await client.post('/test', { data: 'value' });

      expect(getAuthHeader(fetchMock)).toBe('Bearer test-token-123');
    });
  });

  describe('base URL construction', () => {
    it('should construct full URL from host and port', async () => {
      await client.get('/api/v1/status');

      const url = fetchMock.mock.calls[0]?.[0] as string;
      expect(url).toBe('http://localhost:26538/api/v1/status');
    });

    it('should update base URL when settings change', async () => {
      client.setBaseUrl('192.168.1.100', 8080);
      await client.get('/test');

      const url = fetchMock.mock.calls[0]?.[0] as string;
      expect(url).toBe('http://192.168.1.100:8080/test');
    });
  });

  describe('request timeout', () => {
    it('should pass an AbortSignal with 5s timeout', async () => {
      await client.get('/test');

      const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
      expect(init?.signal).toBeDefined();
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    });

    it('should reject if the request times out (signal verification)', async () => {
      const trackedFetch = jest.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );

      const timeoutClient = new ApiClient(trackedFetch as unknown as typeof fetch);
      timeoutClient.setBaseUrl('localhost', 26538);
      timeoutClient.setJwt('token');

      await timeoutClient.get('/test');

      const init = trackedFetch.mock.calls[0]?.[1] as RequestInit | undefined;
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      // Signal should not be aborted when request succeeds
      expect(init?.signal?.aborted).toBe(false);
    });
  });

  describe('HTTP errors', () => {
    it('should reject with ApiError on 401 Unauthorized', async () => {
      fetchMock = mockFetch(401, { error: 'Invalid token' });
      client = new ApiClient(fetchMock as unknown as typeof fetch);
      client.setBaseUrl('localhost', 26538);
      client.setJwt('bad-token');

      await expect(client.get('/test')).rejects.toThrow(
        'Unauthorized: check your JWT token',
      );
    });

    it('should reject with ApiError on other 4xx errors', async () => {
      fetchMock = mockFetch(404, { error: 'Not found' });
      client = new ApiClient(fetchMock as unknown as typeof fetch);
      client.setBaseUrl('localhost', 26538);
      client.setJwt('token');

      await expect(client.get('/test')).rejects.toThrow();
    });

    it('should reject on network errors', async () => {
      const errorFetch = jest.fn<typeof fetch>().mockRejectedValue(
        new Error('Network error'),
      );
      client = new ApiClient(errorFetch as unknown as typeof fetch);
      client.setBaseUrl('localhost', 26538);
      client.setJwt('token');

      await expect(client.get('/test')).rejects.toThrow('Network error');
    });
  });

  describe('retry on failure', () => {
    it('should retry once on network failure', async () => {
      let attempts = 0;
      const failThenSucceed = jest.fn<typeof fetch>().mockImplementation(() => {
        attempts++;
        if (attempts === 1) {
          return Promise.reject(new Error('ECONNREFUSED'));
        }
        return Promise.resolve(
          new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      });

      client = new ApiClient(failThenSucceed as unknown as typeof fetch);
      client.setBaseUrl('localhost', 26538);
      client.setJwt('token');

      await client.get('/test');
      expect(failThenSucceed).toHaveBeenCalledTimes(2);
    });

    it('should NOT retry on 401 errors', async () => {
      let attempts = 0;
      const always401 = jest.fn<typeof fetch>().mockImplementation(() => {
        attempts++;
        return Promise.resolve(
          new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      });

      client = new ApiClient(always401 as unknown as typeof fetch);
      client.setBaseUrl('localhost', 26538);
      client.setJwt('token');

      await expect(client.get('/test')).rejects.toThrow();
      expect(always401).toHaveBeenCalledTimes(1); // no retry on 401
    });

    it('should fail after one retry if both attempts fail', async () => {
      const alwaysFail = jest.fn<typeof fetch>().mockRejectedValue(
        new Error('Connection refused'),
      );

      client = new ApiClient(alwaysFail as unknown as typeof fetch);
      client.setBaseUrl('localhost', 26538);
      client.setJwt('token');

      await expect(client.get('/test')).rejects.toThrow();
      expect(alwaysFail).toHaveBeenCalledTimes(2);
    });
  });

  describe('convenience methods', () => {
    it('playPause should POST to /api/v1/play-pause', async () => {
      await client.playPause();

      const url = fetchMock.mock.calls[0]?.[0] as string;
      expect(url).toContain(ENDPOINTS.PLAY_PAUSE);
      const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
      expect(init?.method).toBe('POST');
    });

    it('next should POST to /api/v1/next', async () => {
      await client.next();
      const url = fetchMock.mock.calls[0]?.[0] as string;
      expect(url).toContain(ENDPOINTS.NEXT);
    });

    it('previous should POST to /api/v1/previous', async () => {
      await client.previous();
      const url = fetchMock.mock.calls[0]?.[0] as string;
      expect(url).toContain(ENDPOINTS.PREVIOUS);
    });

    it('like should POST to /api/v1/like', async () => {
      await client.like();
      const url = fetchMock.mock.calls[0]?.[0] as string;
      expect(url).toContain(ENDPOINTS.LIKE);
    });

    it('dislike should POST to /api/v1/dislike', async () => {
      await client.dislike();
      const url = fetchMock.mock.calls[0]?.[0] as string;
      expect(url).toContain(ENDPOINTS.DISLIKE);
    });

    it('shuffle should POST to /api/v1/shuffle', async () => {
      await client.shuffle();
      const url = fetchMock.mock.calls[0]?.[0] as string;
      expect(url).toContain(ENDPOINTS.SHUFFLE);
    });

    it('repeat should POST to /api/v1/repeat', async () => {
      await client.repeat();
      const url = fetchMock.mock.calls[0]?.[0] as string;
      expect(url).toContain(ENDPOINTS.REPEAT);
    });

    it('setVolume should PUT with absolute value (bug #4458)', async () => {
      await client.setVolume(75);

      const url = fetchMock.mock.calls[0]?.[0] as string;
      expect(url).toContain(ENDPOINTS.VOLUME);
      const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
      expect(init?.method).toBe('PUT');
      expect(init?.body).toBe(JSON.stringify({ volume: 75 }));
    });

    it('seek should POST with position in seconds', async () => {
      await client.seek(30);

      const url = fetchMock.mock.calls[0]?.[0] as string;
      expect(url).toContain(ENDPOINTS.SEEK);
      const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
      expect(init?.body).toBe(JSON.stringify({ position: 30 }));
    });
  });
});
