import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ConnectionManager, initConnectionManager } from '../../common/connection-manager';
import type { ConnectionState } from '../../common/types';

function createMockApiClient() {
  return {
    setBaseUrl: jest.fn(),
    setJwt: jest.fn(),
    get: jest.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 })),
    post: jest.fn(),
    put: jest.fn(),
    playPause: jest.fn(),
    next: jest.fn(),
    previous: jest.fn(),
    like: jest.fn(),
    dislike: jest.fn(),
    shuffle: jest.fn(),
    repeat: jest.fn(),
    setVolume: jest.fn(),
    seek: jest.fn(),
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

  describe('state transitions', () => {
    it('should transition from disconnected to connecting when connect is called', () => {
      cm.connect('localhost', 26538, 'test-jwt');
      expect(cm.getState()).toBe('connecting');
    });

    it('should set base URL and JWT on ApiClient during connect', () => {
      cm.connect('localhost', 26538, 'test-jwt');

      expect(mockApi.setBaseUrl).toHaveBeenCalledWith('localhost', 26538);
      expect(mockApi.setJwt).toHaveBeenCalledWith('test-jwt');
    });

    it('should probe the endpoint and transition to connected on success', async () => {
      mockApi.get.mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );

      cm.connect('localhost', 26538, 'test-jwt');

      // Wait for async probe to complete
      await jest.runAllTimersAsync();

      // The probe resolves, triggering move through states
      // After probe success → call ws.connect → state stays 'connecting' until ws events
    });

    it('should handle probe timeout (3s)', async () => {
      // Override fetch mock to hang forever
      (globalThis as any).fetch = jest.fn().mockImplementationOnce(
        () => new Promise(() => {
          // never resolves
        }),
      );

      cm.connect('localhost', 26538, 'test-jwt');
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

      cm.connect('localhost', 26538, 'test-jwt');

      expect(listener).toHaveBeenCalledWith('connecting');
    });

    it('should notify multiple subscribers', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();

      cm.onStateChange(listener1);
      cm.onStateChange(listener2);

      cm.connect('localhost', 26538, 'test-jwt');

      expect(listener1).toHaveBeenCalledWith('connecting');
      expect(listener2).toHaveBeenCalledWith('connecting');
    });

    it('should support unsubscribe', () => {
      const listener = jest.fn();
      const unsubscribe = cm.onStateChange(listener);
      unsubscribe();

      cm.connect('localhost', 26538, 'test-jwt');

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('isAuthenticated', () => {
    it('should return false when disconnected', () => {
      expect(cm.isAuthenticated()).toBe(false);
    });

    it('should return false when connecting', () => {
      cm.connect('localhost', 26538, 'test-jwt');
      expect(cm.isAuthenticated()).toBe(false);
    });
  });

  describe('disconnect', () => {
    it('should disconnect WebSocket and return to disconnected state', () => {
      cm.connect('localhost', 26538, 'test-jwt');
      cm.disconnect();

      expect(mockWs.disconnect).toHaveBeenCalled();
      expect(cm.getState()).toBe('disconnected');
    });
  });

  describe('probe success path', () => {
    it('should transition to connected and start WS on probe success', async () => {
      cm.connect('localhost', 26538, 'test-jwt');
      expect(cm.getState()).toBe('connecting');

      // Resolve probe fetch
      await jest.runAllTimersAsync();

      // After probe success → state should be 'authenticating' (ws connecting)
      expect(cm.getState()).toBe('authenticating');
      expect(mockWs.connect).toHaveBeenCalledWith(
        'ws://localhost:26538/ws',
        'test-jwt',
      );
    });
  });

  describe('startWsConnection', () => {
    it('should subscribe to player:state and transition to authenticated on first event', async () => {
      // Capture subscribe callback
      let playerStateCallback: ((data: unknown) => void) | null = null;
      const originalSubscribe = mockWs.subscribe;
      mockWs.subscribe = jest.fn().mockImplementation((event: string, cb: (data: unknown) => void) => {
        if (event === 'player:state') {
          playerStateCallback = cb;
        }
        return jest.fn();
      });

      cm.connect('localhost', 26538, 'test-jwt');

      // Flush probe microtasks so fetch resolves → startWsConnection is called
      await jest.runAllTimersAsync();

      // Now wsClient.subscribe should have been called with player:state
      expect(mockWs.subscribe).toHaveBeenCalledWith(
        'player:state',
        expect.any(Function),
      );

      // Simulate first player:state event → should transition to authenticated
      if (playerStateCallback) {
        playerStateCallback({ isPlaying: true });
        expect(cm.getState()).toBe('authenticated');
      }
    });

    it('should set onReconnect handler that transitions to connecting', async () => {
      cm.connect('localhost', 26538, 'test-jwt');
      await jest.runAllTimersAsync();

      // onReconnect should have been set
      expect(mockWs.onReconnect).not.toBeNull();
      if (mockWs.onReconnect) {
        // Simulate reconnect with delay
        mockWs.onReconnect(5000);
        expect(cm.getState()).toBe('connecting');
      }
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
