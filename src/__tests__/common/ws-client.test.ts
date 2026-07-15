import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';
import { WsClient } from '../../common/ws-client';

/** Create a mock WebSocket that we control */
function createMockWs() {
  const listeners: Record<string, Array<(...args: unknown[]) => void>> = {};

  const ws = {
    readyState: 0, // CONNECTING
    OPEN: 1,
    send: jest.fn(),
    close: jest.fn(),
    addEventListener: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(handler);
    }),
    removeEventListener: jest.fn(),
    dispatchEvent: (event: string, ...args: unknown[]) => {
      (listeners[event] || []).forEach((h) => h(...args));
    },
  };

  return ws;
}

describe('WsClient', () => {
  let client: WsClient;
  let mockWs: ReturnType<typeof createMockWs>;

  beforeEach(() => {
    jest.useFakeTimers();
    mockWs = createMockWs();

    const MockWsCtor = jest.fn(() => mockWs) as unknown as typeof WebSocket;
    (MockWsCtor as Record<string, unknown>).OPEN = 1;

    client = new WsClient(MockWsCtor);
  });

  afterEach(() => {
    jest.useRealTimers();
    client.disconnect();
  });

  describe('connection URL includes token as query param', () => {
    it('should construct URL with token query param', () => {
      const MockWsCtor = jest.fn().mockImplementation(() => mockWs) as unknown as typeof WebSocket;
      (MockWsCtor as Record<string, unknown>).OPEN = 1;
      const wsClient = new WsClient(MockWsCtor);

      wsClient.connect('ws://localhost:26538', 'api-token-456');

      // The constructor should have been called with the full URL including token
      expect(MockWsCtor).toHaveBeenCalledWith('ws://localhost:26538/api/v1/ws?token=api-token-456');
    });

    it('should not send auth frame after open (token is in URL)', () => {
      client.connect('ws://localhost:26538', 'test-token');

      // Simulate WebSocket open
      mockWs.readyState = 1; // OPEN
      mockWs.dispatchEvent('open');

      // No auth message should be sent — token is in the URL query param
      expect(mockWs.send).not.toHaveBeenCalled();
    });

    it('should NOT need readyState OPEN to attempt connect', () => {
      const MockWsCtor = jest.fn().mockImplementation(() => mockWs) as unknown as typeof WebSocket;
      (MockWsCtor as Record<string, unknown>).OPEN = 1;
      const wsClient = new WsClient(MockWsCtor);

      wsClient.connect('ws://localhost:26538', 'token');
      // It should create the WebSocket regardless of readyState
      expect(MockWsCtor).toHaveBeenCalled();
    });
  });

  describe('event pub/sub with real event types', () => {
    const connectClient = () => {
      client.connect('ws://localhost:26538', 'test-token');
      mockWs.readyState = 1;
      mockWs.dispatchEvent('open');
    };

    it('should route PLAYER_STATE_CHANGED events to subscribers', () => {
      const handler = jest.fn();
      client.subscribe('PLAYER_STATE_CHANGED', handler);
      connectClient();

      const stateData = { isPlaying: true, volume: 75 };
      mockWs.dispatchEvent('message', {
        data: JSON.stringify({ type: 'PLAYER_STATE_CHANGED', ...stateData }),
      });

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ isPlaying: true, volume: 75 }),
      );
    });

    it('should route VOLUME_CHANGED events', () => {
      const handler = jest.fn();
      client.subscribe('VOLUME_CHANGED', handler);
      connectClient();

      mockWs.dispatchEvent('message', {
        data: JSON.stringify({ type: 'VOLUME_CHANGED', volume: 80, muted: false }),
      });

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ volume: 80, muted: false }),
      );
    });

    it('should route PLAYER_INFO events (initial full state)', () => {
      const handler = jest.fn();
      client.subscribe('PLAYER_INFO', handler);
      connectClient();

      const infoData = {
        type: 'PLAYER_INFO',
        song: { title: 'Test', artist: 'Artist' },
        isPlaying: false,
        muted: true,
        shuffle: false,
        repeat: 'off',
      };
      mockWs.dispatchEvent('message', { data: JSON.stringify(infoData) });

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ song: expect.objectContaining({ title: 'Test' }) }),
      );
    });

    it('should route POSITION_CHANGED events', () => {
      const handler = jest.fn();
      client.subscribe('POSITION_CHANGED', handler);
      connectClient();

      mockWs.dispatchEvent('message', {
        data: JSON.stringify({ type: 'POSITION_CHANGED', position: 142 }),
      });

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ position: 142 }),
      );
    });

    it('should route SHUFFLE_CHANGED events', () => {
      const handler = jest.fn();
      client.subscribe('SHUFFLE_CHANGED', handler);
      connectClient();

      mockWs.dispatchEvent('message', {
        data: JSON.stringify({ type: 'SHUFFLE_CHANGED', shuffle: true }),
      });

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ shuffle: true }),
      );
    });

    it('should route REPEAT_CHANGED events', () => {
      const handler = jest.fn();
      client.subscribe('REPEAT_CHANGED', handler);
      connectClient();

      mockWs.dispatchEvent('message', {
        data: JSON.stringify({ type: 'REPEAT_CHANGED', repeat: 'one' }),
      });

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ repeat: 'one' }),
      );
    });

    it('should NOT route events to unsubscribed handlers', () => {
      const handler = jest.fn();
      const unsubscribe = client.subscribe('PLAYER_STATE_CHANGED', handler);
      unsubscribe();
      connectClient();

      mockWs.dispatchEvent('message', {
        data: JSON.stringify({ type: 'PLAYER_STATE_CHANGED', isPlaying: true }),
      });

      expect(handler).not.toHaveBeenCalled();
    });

    it('should support multiple subscribers for same event', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      client.subscribe('PLAYER_STATE_CHANGED', handler1);
      client.subscribe('PLAYER_STATE_CHANGED', handler2);
      connectClient();

      mockWs.dispatchEvent('message', {
        data: JSON.stringify({ type: 'PLAYER_STATE_CHANGED', isPlaying: true }),
      });

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    it('should handle VIDEO_CHANGED events', () => {
      const handler = jest.fn();
      client.subscribe('VIDEO_CHANGED', handler);
      connectClient();

      const videoData = {
        type: 'VIDEO_CHANGED',
        song: { title: 'New Song', artist: 'New Artist', album: 'New Album', duration: 240, thumbnailUrl: 'https://example.com/thumb.jpg' },
      };
      mockWs.dispatchEvent('message', { data: JSON.stringify(videoData) });

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ song: expect.objectContaining({ title: 'New Song' }) }),
      );
    });
  });

  describe('disconnect', () => {
    it('should close WebSocket on disconnect', () => {
      client.connect('ws://localhost:26538', 'test-token');
      client.disconnect();

      expect(mockWs.close).toHaveBeenCalled();
    });

    it('should remove all event listeners on disconnect', () => {
      const handler = jest.fn();
      client.connect('ws://localhost:26538', 'test-token');
      mockWs.readyState = 1;
      mockWs.dispatchEvent('open');

      client.subscribe('PLAYER_STATE_CHANGED', handler);
      client.disconnect();

      // Simulate another message after disconnect
      mockWs.dispatchEvent('message', {
        data: JSON.stringify({ type: 'PLAYER_STATE_CHANGED', isPlaying: true }),
      });

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('backoff reconnect', () => {
    it('should start at 1 second delay', () => {
      let reconnectDelay = 0;
      client.onReconnect = (delay: number) => {
        reconnectDelay = delay;
      };

      client.connect('ws://localhost:26538', 'test-token');
      // Simulate close
      mockWs.dispatchEvent('close', { code: 1006 });

      expect(reconnectDelay).toBe(1000); // 1s
    });

    it('should double on successive failures up to 60s cap', () => {
      const delays: number[] = [];
      client.onReconnect = (delay: number) => {
        delays.push(delay);
      };

      client.connect('ws://localhost:26538', 'test-token');

      // Simulate 8 consecutive close events
      for (let i = 0; i < 8; i++) {
        mockWs.dispatchEvent('close', { code: 1006 });
      }

      expect(delays).toEqual([1000, 2000, 4000, 8000, 16000, 32000, 60000, 60000]);
    });

    it('should reset to 1s on successful connection', () => {
      client.connect('ws://localhost:26538', 'test-token');

      // First failure: 1s
      mockWs.dispatchEvent('close', { code: 1006 });
      // Second failure: 2s
      mockWs.dispatchEvent('close', { code: 1006 });

      // Now successful connection
      mockWs.readyState = 1;
      mockWs.dispatchEvent('open');

      // Close again — should be back to 1s
      let resetDelay = 0;
      client.onReconnect = (delay: number) => {
        resetDelay = delay;
      };
      mockWs.dispatchEvent('close', { code: 1006 });

      expect(resetDelay).toBe(1000);
    });
  });
});
