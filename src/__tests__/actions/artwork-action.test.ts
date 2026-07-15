import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const mockState = {
  song: null as {
    title: string;
    artist: string;
    album: string;
    duration: number;
    thumbnailUrl: string;
  } | null,
  position: 0,
};

const mockConnected = { value: true };

jest.unstable_mockModule('../../common/state-store', () => ({
  stateStore: {
    get: (key: string) => (mockState as any)[key],
    getState: () => ({ ...mockState }),
    subscribe: jest.fn().mockReturnValue(jest.fn()),
    update: jest.fn(),
  },
}));

jest.unstable_mockModule('../../common/connection-manager', () => ({
  connectionManager: {
    isAuthenticated: () => mockConnected.value,
    onStateChange: jest.fn().mockReturnValue(jest.fn()),
  },
  initConnectionManager: jest.fn(),
}));

jest.unstable_mockModule('../../common/api-client', () => ({
  apiClient: {
    getSong: jest.fn().mockResolvedValue(new Response()),
  },
}));

jest.unstable_mockModule('../../common/logger', () => ({
  logger: {
    isDebug: false,
    trace: jest.fn(), debug: jest.fn(), info: jest.fn(),
    warn: jest.fn(), error: jest.fn(),
  },
}));

// Mock global fetch for album art
(globalThis as any).fetch = jest.fn();

const { ArtworkAction } = await import('../../actions/artwork-action');

function createWillAppearEvent(settings: Record<string, unknown> = {}): any {
  return {
    action: {
      manifestId: 'com.streamdek.artwork',
      setImage: jest.fn().mockResolvedValue(undefined),
      setTitle: jest.fn().mockResolvedValue(undefined),
      setState: jest.fn().mockResolvedValue(undefined),
    },
    payload: {
      settings,
      controller: 'Keypad',
      coordinates: { row: 0, column: 0 },
    },
  };
}

function createWillDisappearEvent(): any {
  return {
    action: {
      manifestId: 'com.streamdek.artwork',
    },
    payload: { settings: {}, controller: 'Keypad' },
  };
}

describe('ArtworkAction', () => {
  let action: ArtworkAction;

  beforeEach(() => {
    jest.clearAllMocks();
    mockConnected.value = true;
    mockState.song = null;
    mockState.position = 0;
    (globalThis as any).fetch = jest.fn().mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'Content-Type': 'image/jpeg' } }),
    );
    action = new ArtworkAction();
  });

  describe('onWillAppear', () => {
    it('should subscribe to state changes', async () => {
      const ev = createWillAppearEvent();
      await action.onWillAppear!(ev);
      // subscribe should have been called
      const { stateStore } = await import('../../common/state-store');
      expect(stateStore.subscribe).toHaveBeenCalled();
    });

    it('should show placeholder when no song is playing', async () => {
      mockState.song = null;
      const ev = createWillAppearEvent();
      await action.onWillAppear!(ev);
      expect(ev.action.setImage).toHaveBeenCalledWith('imgs/actions/artwork/artwork');
    });

    it('should show warning when not authenticated', async () => {
      mockConnected.value = false;
      const ev = createWillAppearEvent();
      await action.onWillAppear!(ev);
      expect(ev.action.setImage).toHaveBeenCalledWith('imgs/actions/warning');
    });

    it('should render artwork and title when song is playing', async () => {
      mockState.song = {
        title: 'Test Song',
        artist: 'Test Artist',
        album: 'Test Album',
        duration: 200,
        thumbnailUrl: 'https://example.com/art.jpg',
      };

      const ev = createWillAppearEvent({ showTrackInfo: true, textTemplate: '{title} - {artist}' });
      await action.onWillAppear!(ev);

      // Should have fetched the image
      expect((globalThis as any).fetch).toHaveBeenCalledWith('https://example.com/art.jpg');
      // Wait for microtasks
      await new Promise((r) => setTimeout(r, 10));
      expect(ev.action.setImage).toHaveBeenCalled();
    });

    it('should NOT set title when showTrackInfo is false', async () => {
      mockState.song = {
        title: 'Test Song',
        artist: 'Test Artist',
        album: 'Test Album',
        duration: 200,
        thumbnailUrl: 'https://example.com/art.jpg',
      };

      const ev = createWillAppearEvent({ showTrackInfo: false });
      await action.onWillAppear!(ev);

      await new Promise((r) => setTimeout(r, 10));
      expect(ev.action.setTitle).not.toHaveBeenCalled();
    });
  });

  describe('onWillDisappear', () => {
    it('should unsubscribe from state changes', async () => {
      const ev = createWillAppearEvent();
      await action.onWillAppear!(ev);
      // onWillDisappear should clean up
      const disappearEv = createWillDisappearEvent();
      action.onWillDisappear!(disappearEv);
      // Should not throw
    });
  });
});
