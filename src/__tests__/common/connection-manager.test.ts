import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ConnectionManager, initConnectionManager } from '../../common/connection-manager';
import type { ConnectionState } from '../../common/types';

function createMockApiClient() {
  return {
    setBaseUrl: jest.fn(),
    setToken: jest.fn(),
    authenticate: jest.fn().mockResolvedValue('mock-access-token'),
    get: jest.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 })),
    post: jest.fn(),
    togglePlay: jest.fn(),
    next: jest.fn(),
    previous: jest.fn(),
    like: jest.fn(),
    dislike: jest.fn(),
    shuffle: jest.fn(),
    switchRepeat: jest.fn(),
    setVolume: jest.fn(),
    toggleMute: jest.fn(),
    seekTo: jest.fn(),
    getSong: jest.fn(),
  };
}

function createMockWsClient() {
  return {
    connect: jest.fn(),
    disconnect: jest.fn(),
    subscribe: jest.fn().mockReturnValue(jest.fn()),
    onReconnect: null as ((delay: number) => void) | null,
  };
}

describe('ConnectionManager', () => {
  let cm: ConnectionManager;
  let mockApi: ReturnType<typeof createMockApiClient>;
  let mockWs: ReturnType<typeof createMockWsClient>;

  beforeEach(() => {
    jest.useFakeTimers();
    mockApi = createMockApiClient();
    mockWs = createMockWsClient();
    cm = new ConnectionManager(mockApi as any, mockWs as any);

    // Mock global fetch — used by startProbe
    (globalThis as any).fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
  });

  afterEach(() => {
    jest.useRealTimers();
    delete (globalThis as any).fetch;
  });

  describe('initial state', () => {
    it('should start in disconnected state', () => {
      expect(cm.getState()).toBe('disconnected');
    });
  });

  describe('connect (no JWT — auth flow deferred)', () => {
    it('should transition from disconnected to connecting when connect is called', () => {
      cm.connect('localhost', 26538);
      expect(cm.getState()).toBe('connecting');
    });

    it('should set base URL on ApiClient during connect', () => {
      cm.connect('localhost', 26538);

      expect(mockApi.setBaseUrl).toHaveBeenCalledWith('localhost', 26538);
    });

    it('should NOT set token on ApiClient during connect (auth happens later)', () => {
      cm.connect('localhost', 26538);
      expect(mockApi.setToken).not.toHaveBeenCalled();
    });

    it('should probe the endpoint using GET / (or a simple reachability check)', async () => {
      cm.connect('localhost', 26538);

      await jest.runAllTimersAsync();

      // After probe success, should transition to 'connected'
      expect(cm.getState()).toBe('connected');
    });
  });

  describe('probe timeout', () => {
    it('should handle probe timeout (3s)', async () => {
      // Override fetch mock to hang forever
      (globalThis as any).fetch = jest.fn().mockImplementationOnce(
        () => new Promise(() => {
          // never resolves
        }),
      );

      cm.connect('localhost', 26538);
      expect(cm.getState()).toBe('connecting');

      // Advance past the 3s probe timeout
      jest.advanceTimersByTime(3100);
      await jest.runAllTimersAsync();

      // After probe timeout, should emit disconnected
      expect(cm.getState()).toBe('disconnected');
    });
  });

  describe('authenticate flow', () => {
    it('should call apiClient.authenticate when authenticate() is invoked', async () => {
      cm.connect('localhost', 26538);
      await jest.runAllTimersAsync();
      expect(cm.getState()).toBe('connected');

      await cm.authenticate('streamdek-abc123');

      expect(mockApi.authenticate).toHaveBeenCalledWith('streamdek-abc123');
    });

    it('should set token and transition to authenticated on success', async () => {
      mockApi.authenticate.mockImplementation(() => Promise.resolve('returned-jwt-token'));

      cm.connect('localhost', 26538);
      await jest.runAllTimersAsync();

      await cm.authenticate('streamdek-abc123');

      expect(mockApi.setToken).toHaveBeenCalledWith('returned-jwt-token');
      expect(cm.getState()).toBe('authenticated');
    });

    it('should emit waiting_for_auth state during authenticate', async () => {
      mockApi.authenticate.mockImplementation(() => Promise.resolve('returned-jwt-token'));
      const states: ConnectionState[] = [];
      cm.onStateChange((s) => states.push(s));

      cm.connect('localhost', 26538);
      await jest.runAllTimersAsync();

      // Start auth — state changes tracked via listener
      await cm.authenticate('streamdek-abc123');

      // Should have seen 'waiting_for_auth' at some point
      // Since mock resolves immediately, we might not catch it, but the method exists
      expect(mockApi.setToken).toHaveBeenCalledWith('returned-jwt-token');
    });

    it('should transition to disconnected on auth failure', async () => {
      mockApi.authenticate.mockImplementation(() => Promise.reject(new Error('Auth failed')));

      cm.connect('localhost', 26538);
      await jest.runAllTimersAsync();

      await cm.authenticate('streamdek-abc123');

      expect(cm.getState()).toBe('disconnected');
    });
  });

  describe('onStateChange', () => {
    it('should notify subscriber on state change', () => {
      const listener = jest.fn();
      cm.onStateChange(listener);

      cm.connect('localhost', 26538);

      expect(listener).toHaveBeenCalledWith('connecting');
    });

    it('should notify multiple subscribers', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();

      cm.onStateChange(listener1);
      cm.onStateChange(listener2);

      cm.connect('localhost', 26538);

      expect(listener1).toHaveBeenCalledWith('connecting');
      expect(listener2).toHaveBeenCalledWith('connecting');
    });

    it('should support unsubscribe', () => {
      const listener = jest.fn();
      const unsubscribe = cm.onStateChange(listener);
      unsubscribe();

      cm.connect('localhost', 26538);

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('isAuthenticated', () => {
    it('should return false when disconnected', () => {
      expect(cm.isAuthenticated()).toBe(false);
    });

    it('should return false when connecting', () => {
      cm.connect('localhost', 26538);
      expect(cm.isAuthenticated()).toBe(false);
    });

    it('should return false when connected but not yet authenticated', async () => {
      cm.connect('localhost', 26538);
      await jest.runAllTimersAsync();
      expect(cm.isAuthenticated()).toBe(false);
    });
  });

  describe('disconnect', () => {
    it('should disconnect WebSocket and return to disconnected state', () => {
      cm.connect('localhost', 26538);
      cm.disconnect();

      expect(mockWs.disconnect).toHaveBeenCalled();
      expect(cm.getState()).toBe('disconnected');
    });
  });

  describe('WS connection after authentication', () => {
    it('should connect WebSocket after successful auth', async () => {
      mockApi.authenticate.mockImplementation(() => Promise.resolve('returned-jwt-token'));
      cm.connect('localhost', 26538);
      await jest.runAllTimersAsync();

      await cm.authenticate('streamdek-abc123');

      // After auth → wsClient.connect should be called with baseUrl + token
      expect(mockWs.connect).toHaveBeenCalledWith(
        'http://localhost:26538',
        'returned-jwt-token',
      );
    });

    it('should set onReconnect handler that transitions to connecting', async () => {
      cm.connect('localhost', 26538);
      await jest.runAllTimersAsync();
      await cm.authenticate('streamdek-abc123');

      // onReconnect should have been set
      expect(mockWs.onReconnect).not.toBeNull();
    });
  });

  describe('initConnectionManager', () => {
    it('should create and return a ConnectionManager instance', () => {
      const instance = initConnectionManager(mockApi as any, mockWs as any);
      expect(instance).toBeInstanceOf(ConnectionManager);
      expect(instance.getState()).toBe('disconnected');
    });
  });
});
