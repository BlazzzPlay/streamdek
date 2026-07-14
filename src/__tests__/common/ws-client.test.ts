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

  describe('connection', () => {
    it('should send JWT as first frame after open', () => {
      client.connect('ws://localhost:26538/ws', 'test-jwt');

      // Simulate WebSocket open
      mockWs.readyState = 1; // OPEN
      mockWs.dispatchEvent('open');

      expect(mockWs.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'auth', token: 'test-jwt' }),
      );
    });

    it('should not send JWT if connection fails', () => {
      client.connect('ws://localhost:26538/ws', 'test-jwt');

      // Simulate error without open
      mockWs.dispatchEvent('error', new Error('Connection refused'));

      expect(mockWs.send).not.toHaveBeenCalled();
    });
  });

  describe('event pub/sub', () => {
    const connectAndAuth = () => {
      client.connect('ws://localhost:26538/ws', 'test-jwt');
      mockWs.readyState = 1;
      mockWs.dispatchEvent('open');
      // Simulate server ack
      mockWs.dispatchEvent('message', {
        data: JSON.stringify({ type: 'auth:ok' }),
      });
    };

    it('should route typed events to subscribers', () => {
      const handler = jest.fn();
      client.subscribe('player:state', handler);
      connectAndAuth();

      const stateData = { isPlaying: true, volume: 75 };
      mockWs.dispatchEvent('message', {
        data: JSON.stringify({ type: 'player:state', ...stateData }),
      });

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ isPlaying: true, volume: 75 }),
      );
    });

    it('should route player:volume events', () => {
      const handler = jest.fn();
      client.subscribe('player:volume', handler);
      connectAndAuth();

      mockWs.dispatchEvent('message', {
        data: JSON.stringify({ type: 'player:volume', volume: 80 }),
      });

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ volume: 80 }),
      );
    });

    it('should route player:like events', () => {
      const handler = jest.fn();
      client.subscribe('player:like', handler);
      connectAndAuth();

      mockWs.dispatchEvent('message', {
        data: JSON.stringify({ type: 'player:like', isLiked: true }),
      });

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ isLiked: true }),
      );
    });

    it('should NOT route events to unsubscribed handlers', () => {
      const handler = jest.fn();
      const unsubscribe = client.subscribe('player:state', handler);
      unsubscribe();
      connectAndAuth();

      mockWs.dispatchEvent('message', {
        data: JSON.stringify({ type: 'player:state', isPlaying: true }),
      });

      expect(handler).not.toHaveBeenCalled();
    });

    it('should support multiple subscribers for same event', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      client.subscribe('player:state', handler1);
      client.subscribe('player:state', handler2);
      connectAndAuth();

      mockWs.dispatchEvent('message', {
        data: JSON.stringify({ type: 'player:state', isPlaying: true }),
      });

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });
  });

  describe('disconnect', () => {
    it('should close WebSocket on disconnect', () => {
      client.connect('ws://localhost:26538/ws', 'test-jwt');
      client.disconnect();

      expect(mockWs.close).toHaveBeenCalled();
    });

    it('should remove all event listeners on disconnect', () => {
      const handler = jest.fn();
      client.connect('ws://localhost:26538/ws', 'test-jwt');
      mockWs.readyState = 1;
      mockWs.dispatchEvent('open');
      mockWs.dispatchEvent('message', {
        data: JSON.stringify({ type: 'auth:ok' }),
      });

      client.subscribe('player:state', handler);
      client.disconnect();

      // Simulate another message after disconnect
      mockWs.dispatchEvent('message', {
        data: JSON.stringify({ type: 'player:state', isPlaying: true }),
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

      client.connect('ws://localhost:26538/ws', 'test-jwt');
      // Simulate close
      mockWs.dispatchEvent('close', { code: 1006 });

      expect(reconnectDelay).toBe(1000); // 1s
    });

    it('should double on successive failures up to 60s cap', () => {
      const delays: number[] = [];
      client.onReconnect = (delay: number) => {
        delays.push(delay);
      };

      client.connect('ws://localhost:26538/ws', 'test-jwt');

      // Simulate 8 consecutive close events
      for (let i = 0; i < 8; i++) {
        mockWs.dispatchEvent('close', { code: 1006 });
      }

      expect(delays).toEqual([1000, 2000, 4000, 8000, 16000, 32000, 60000, 60000]);
    });

    it('should reset to 1s on successful connection', () => {
      client.connect('ws://localhost:26538/ws', 'test-jwt');

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
