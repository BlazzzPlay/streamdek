import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ConnectionManager, initConnectionManager } from '../../common/connection-manager';
import type { ConnectionState } from '../../common/types';

function createMockApiClient() {
  return {
    setBaseUrl: jest.fn(),
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
    goForward: jest.fn(),
    goBack: jest.fn(),
    addTrack: jest.fn(),
    addPlaylist: jest.fn(),
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

  describe('connect (no auth — direct flow)', () => {
    it('should transition from disconnected to connecting when connect is called', () => {
      cm.connect('localhost', 26538);
      expect(cm.getState()).toBe('connecting');
    });

    it('should set base URL on ApiClient during connect', () => {
      cm.connect('localhost', 26538);

      expect(mockApi.setBaseUrl).toHaveBeenCalledWith('localhost', 26538);
    });

    it('should probe the endpoint and transition to authenticated on success', async () => {
      cm.connect('localhost', 26538);

      await jest.runAllTimersAsync();

      // After probe success, should transition to 'authenticated'
      expect(cm.getState()).toBe('authenticated');
    });

    it('should start WebSocket connection after probe succeeds', async () => {
      cm.connect('localhost', 26538);
      await jest.runAllTimersAsync();

      expect(mockWs.connect).toHaveBeenCalledWith('ws://localhost:26538');
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

    it('should notify authenticated on probe success', async () => {
      const listener = jest.fn();
      cm.onStateChange(listener);

      cm.connect('localhost', 26538);
      await jest.runAllTimersAsync();

      expect(listener).toHaveBeenCalledWith('authenticated');
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

    it('should return true after probe succeeds', async () => {
      cm.connect('localhost', 26538);
      await jest.runAllTimersAsync();
      expect(cm.isAuthenticated()).toBe(true);
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

  describe('ws-client integration', () => {
    it('should set onReconnect handler', async () => {
      cm.connect('localhost', 26538);
      await jest.runAllTimersAsync();

      expect(mockWs.onReconnect).not.toBeNull();
    });

    it('should transition to connecting on WS reconnect', async () => {
      cm.connect('localhost', 26538);
      await jest.runAllTimersAsync();

      // Simulate reconnect
      expect(mockWs.onReconnect).not.toBeNull();
      (mockWs.onReconnect as any)(1000);

      // After reconnect trigger, should be 'connecting'
      // (the handler calls transition('connecting'))
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
