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

describe('ApiClient', () => {
  let client: ApiClient;
  let fetchMock: jest.Mock<typeof fetch>;

  beforeEach(() => {
    fetchMock = mockFetch(200);
    client = new ApiClient(fetchMock as unknown as typeof fetch);
    client.setBaseUrl('localhost', 26538);
  });

  describe('no authorization header', () => {
    it('should NOT include Authorization header on GET requests', async () => {
      await client.get('/test');

      const call = fetchMock.mock.calls[0];
      const init = call?.[1] as RequestInit | undefined;
      const headers = init?.headers as Record<string, string> | undefined;
      expect(headers?.['Authorization']).toBeUndefined();
    });

    it('should NOT include Authorization header on POST requests', async () => {
      await client.post('/test', { data: 'value' });

      const call = fetchMock.mock.calls[0];
      const init = call?.[1] as RequestInit | undefined;
      const headers = init?.headers as Record<string, string> | undefined;
      expect(headers?.['Authorization']).toBeUndefined();
    });
  });

  describe('base URL construction', () => {
    it('should construct full URL from host and port', async () => {
      await client.get('/api/v1/song');

      const url = fetchMock.mock.calls[0]?.[0] as string;
      expect(url).toBe('http://localhost:26538/api/v1/song');
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

      await timeoutClient.get('/test');

      const init = trackedFetch.mock.calls[0]?.[1] as RequestInit | undefined;
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      // Signal should not be aborted when request succeeds
      expect(init?.signal?.aborted).toBe(false);
    });
  });

  describe('HTTP errors', () => {
    it('should reject with ApiError on 4xx errors', async () => {
      fetchMock = mockFetch(404, { error: 'Not found' });
      client = new ApiClient(fetchMock as unknown as typeof fetch);
      client.setBaseUrl('localhost', 26538);

      await expect(client.get('/test')).rejects.toThrow();
    });

    it('should reject on network errors', async () => {
      const errorFetch = jest.fn<typeof fetch>().mockRejectedValue(
        new Error('Network error'),
      );
      client = new ApiClient(errorFetch as unknown as typeof fetch);
      client.setBaseUrl('localhost', 26538);

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

      await client.get('/test');
      expect(failThenSucceed).toHaveBeenCalledTimes(2);
    });

    it('should fail after one retry if both attempts fail', async () => {
      const alwaysFail = jest.fn<typeof fetch>().mockRejectedValue(
        new Error('Connection refused'),
      );

      client = new ApiClient(alwaysFail as unknown as typeof fetch);
      client.setBaseUrl('localhost', 26538);

      await expect(client.get('/test')).rejects.toThrow();
      expect(alwaysFail).toHaveBeenCalledTimes(2);
    });
  });

  describe('convenience methods', () => {
    it('togglePlay should POST to /api/v1/toggle-play', async () => {
      await client.togglePlay();

      const url = fetchMock.mock.calls[0]?.[0] as string;
      expect(url).toContain(ENDPOINTS.TOGGLE_PLAY);
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

    it('switchRepeat should POST to /api/v1/switch-repeat with iteration body', async () => {
      await client.switchRepeat(2);

      const url = fetchMock.mock.calls[0]?.[0] as string;
      expect(url).toContain(ENDPOINTS.SWITCH_REPEAT);
      const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
      expect(init?.body).toBe(JSON.stringify({ iteration: 2 }));
    });

    it('setVolume should POST with absolute value (bug #4458)', async () => {
      await client.setVolume(75);

      const url = fetchMock.mock.calls[0]?.[0] as string;
      expect(url).toContain(ENDPOINTS.VOLUME);
      const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
      expect(init?.method).toBe('POST');
      expect(init?.body).toBe(JSON.stringify({ volume: 75 }));
    });

    it('toggleMute should POST to /api/v1/toggle-mute', async () => {
      await client.toggleMute();

      const url = fetchMock.mock.calls[0]?.[0] as string;
      expect(url).toContain(ENDPOINTS.TOGGLE_MUTE);
      const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
      expect(init?.method).toBe('POST');
    });

    it('seekTo should POST with seconds in body', async () => {
      await client.seekTo(30);

      const url = fetchMock.mock.calls[0]?.[0] as string;
      expect(url).toContain(ENDPOINTS.SEEK_TO);
      const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
      expect(init?.body).toBe(JSON.stringify({ seconds: 30 }));
    });

    it('getSong should GET /api/v1/song', async () => {
      await client.getSong();

      const url = fetchMock.mock.calls[0]?.[0] as string;
      expect(url).toContain(ENDPOINTS.SONG);
      const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
      expect(init?.method).toBe('GET');
    });

    it('goForward should POST to /api/v1/go-forward with seconds', async () => {
      await client.goForward(15);

      const url = fetchMock.mock.calls[0]?.[0] as string;
      expect(url).toContain(ENDPOINTS.GO_FORWARD);
      const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
      expect(init?.body).toBe(JSON.stringify({ seconds: 15 }));
    });

    it('goBack should POST to /api/v1/go-back with seconds', async () => {
      await client.goBack(5);

      const url = fetchMock.mock.calls[0]?.[0] as string;
      expect(url).toContain(ENDPOINTS.GO_BACK);
      const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
      expect(init?.body).toBe(JSON.stringify({ seconds: 5 }));
    });

    it('addTrack should POST to /api/v1/queue with videoId', async () => {
      await client.addTrack('dQw4w9WgXcQ');

      const url = fetchMock.mock.calls[0]?.[0] as string;
      expect(url).toContain(ENDPOINTS.QUEUE);
      const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
      expect(init?.body).toBe(JSON.stringify({ videoId: 'dQw4w9WgXcQ' }));
    });

    it('addTrack should include forcePlay when true', async () => {
      await client.addTrack('dQw4w9WgXcQ', true);

      const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
      expect(init?.body).toBe(JSON.stringify({ videoId: 'dQw4w9WgXcQ', forcePlay: true }));
    });

    it('addPlaylist should POST to /api/v1/queue with playlistId', async () => {
      await client.addPlaylist('PL123');

      const url = fetchMock.mock.calls[0]?.[0] as string;
      expect(url).toContain(ENDPOINTS.QUEUE);
      const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
      expect(init?.body).toBe(JSON.stringify({ playlistId: 'PL123' }));
    });

    it('addPlaylist should include forcePlay and shuffle when true', async () => {
      await client.addPlaylist('PL456', true, true);

      const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
      expect(init?.body).toBe(JSON.stringify({ playlistId: 'PL456', forcePlay: true, shuffle: true }));
    });
  });
});
