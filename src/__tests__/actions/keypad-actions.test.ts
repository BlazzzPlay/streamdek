import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Mock singletons
const mockMethods = {
  togglePlay: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  next: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  previous: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  like: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  dislike: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  shuffle: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  switchRepeat: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  goForward: jest.fn<(seconds: number) => Promise<void>>().mockResolvedValue(undefined),
  goBack: jest.fn<(seconds: number) => Promise<void>>().mockResolvedValue(undefined),
  setVolume: jest.fn<(volume: number) => Promise<void>>().mockResolvedValue(undefined),
  addTrack: jest.fn<(videoId: string, forcePlay?: boolean) => Promise<void>>().mockResolvedValue(undefined),
  addPlaylist: jest.fn<(playlistId: string, forcePlay?: boolean, shuffle?: boolean) => Promise<void>>().mockResolvedValue(undefined),
};

const mockState = {
  isPlaying: true, muted: false, isLiked: false, isDisliked: false,
  shuffle: false, repeat: 'off' as const, volume: 80,
  position: 120, song: { title: 'Test', artist: 'Artist', album: 'Album', duration: 300, thumbnailUrl: '' },
};

const mockConnectionState = { authenticated: true };

jest.unstable_mockModule('../../common/api-client', () => ({
  apiClient: new Proxy({} as any, { get: (_t, p) => (mockMethods as any)[p] }),
}));

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
    isAuthenticated: () => mockConnectionState.authenticated,
    getState: () => 'authenticated',
    onStateChange: jest.fn().mockReturnValue(jest.fn()),
    connect: jest.fn(),
    disconnect: jest.fn(),
  },
  initConnectionManager: jest.fn(),
}));

jest.unstable_mockModule('../../common/logger', () => ({
  logger: {
    isDebug: false,
    trace: jest.fn(), debug: jest.fn(), info: jest.fn(),
    warn: jest.fn(), error: jest.fn(),
  },
}));

const { PlayPauseAction, NextTrackAction, PreviousTrackAction,
  LikeAction, DislikeAction, ShuffleAction, RepeatAction,
  GoForwardAction, GoBackAction, SetVolumeAction, AddTrackAction, AddPlaylistAction }
  = await import('../../actions/keypad-actions');

function createKeyEvent(state = 0): any {
  return {
    action: {
      manifestId: 'com.streamdek.test',
      setImage: jest.fn().mockResolvedValue(undefined),
      setState: jest.fn().mockResolvedValue(undefined),
      setTitle: jest.fn().mockResolvedValue(undefined),
      showOk: jest.fn().mockResolvedValue(undefined),
    },
    payload: { settings: {}, coordinates: { row: 0, column: 0 }, state, isInMultiAction: false, controller: 'Keypad' },
  };
}

describe('Keypad Actions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConnectionState.authenticated = true;
    Object.values(mockMethods).forEach((fn) => fn.mockResolvedValue(undefined));
  });

  const actionTests = [
    { name: 'PlayPauseAction', Class: PlayPauseAction, method: 'togglePlay' },
    { name: 'NextTrackAction', Class: NextTrackAction, method: 'next' },
    { name: 'PreviousTrackAction', Class: PreviousTrackAction, method: 'previous' },
    { name: 'LikeAction', Class: LikeAction, method: 'like' },
    { name: 'DislikeAction', Class: DislikeAction, method: 'dislike' },
    { name: 'ShuffleAction', Class: ShuffleAction, method: 'shuffle' },
    { name: 'RepeatAction', Class: RepeatAction, method: 'switchRepeat' },
  ] as const;

  for (const { name, Class, method } of actionTests) {
    describe(name, () => {
      it(`should call apiClient.${method} when authenticated`, async () => {
        const action = new Class() as any;
        const ev = createKeyEvent();
        if (typeof action.onKeyDown === 'function') {
          await action.onKeyDown(ev);
        }
        expect((mockMethods as any)[method]).toHaveBeenCalled();
      });

      it('should NOT call API when not authenticated', async () => {
        mockConnectionState.authenticated = false;
        const action = new Class() as any;
        const ev = createKeyEvent();
        if (typeof action.onKeyDown === 'function') {
          await action.onKeyDown(ev);
        }
        expect((mockMethods as any)[method]).not.toHaveBeenCalled();
      });

      it('should set warning image when not authenticated', async () => {
        mockConnectionState.authenticated = false;
        const action = new Class() as any;
        const ev = createKeyEvent();
        if (typeof action.onKeyDown === 'function') {
          await action.onKeyDown(ev);
        }
        expect(ev.action.setImage).toHaveBeenCalledWith('imgs/actions/warning');
      });
    });
  }

  describe('GoForwardAction', () => {
    it('should call apiClient.goForward with default 10s', async () => {
      const action = new GoForwardAction() as any;
      const ev = createKeyEvent();
      await action.onKeyDown(ev);
      expect(mockMethods.goForward).toHaveBeenCalledWith(10);
    });

    it('should call apiClient.goForward with configured seconds', async () => {
      const action = new GoForwardAction() as any;
      const ev = createKeyEvent();
      ev.payload.settings = { seconds: 30 };
      await action.onKeyDown(ev);
      expect(mockMethods.goForward).toHaveBeenCalledWith(30);
    });

    it('should show ok after success', async () => {
      const action = new GoForwardAction() as any;
      const ev = createKeyEvent();
      await action.onKeyDown(ev);
      expect(ev.action.showOk).toHaveBeenCalled();
    });

    it('should NOT call API when not authenticated', async () => {
      mockConnectionState.authenticated = false;
      const action = new GoForwardAction() as any;
      const ev = createKeyEvent();
      await action.onKeyDown(ev);
      expect(mockMethods.goForward).not.toHaveBeenCalled();
    });
  });

  describe('GoBackAction', () => {
    it('should call apiClient.goBack with default 10s', async () => {
      const action = new GoBackAction() as any;
      const ev = createKeyEvent();
      await action.onKeyDown(ev);
      expect(mockMethods.goBack).toHaveBeenCalledWith(10);
    });

    it('should call apiClient.goBack with configured seconds', async () => {
      const action = new GoBackAction() as any;
      const ev = createKeyEvent();
      ev.payload.settings = { seconds: 5 };
      await action.onKeyDown(ev);
      expect(mockMethods.goBack).toHaveBeenCalledWith(5);
    });

    it('should NOT call API when not authenticated', async () => {
      mockConnectionState.authenticated = false;
      const action = new GoBackAction() as any;
      const ev = createKeyEvent();
      await action.onKeyDown(ev);
      expect(mockMethods.goBack).not.toHaveBeenCalled();
    });
  });

  describe('SetVolumeAction', () => {
    it('should call apiClient.setVolume with default 50', async () => {
      const action = new SetVolumeAction() as any;
      const ev = createKeyEvent();
      await action.onKeyDown(ev);
      expect(mockMethods.setVolume).toHaveBeenCalledWith(50);
    });

    it('should call apiClient.setVolume with configured value', async () => {
      const action = new SetVolumeAction() as any;
      const ev = createKeyEvent();
      ev.payload.settings = { volume: 75 };
      await action.onKeyDown(ev);
      expect(mockMethods.setVolume).toHaveBeenCalledWith(75);
    });

    it('should clamp volume to 0-100 range', async () => {
      const action = new SetVolumeAction() as any;
      const ev1 = createKeyEvent();
      ev1.payload.settings = { volume: 150 };
      await action.onKeyDown(ev1);
      expect(mockMethods.setVolume).toHaveBeenCalledWith(100);

      const ev2 = createKeyEvent();
      ev2.payload.settings = { volume: -10 };
      await action.onKeyDown(ev2);
      expect(mockMethods.setVolume).toHaveBeenCalledWith(0);
    });
  });

  describe('AddTrackAction', () => {
    it('should call apiClient.addTrack with videoId', async () => {
      const action = new AddTrackAction() as any;
      const ev = createKeyEvent();
      ev.payload.settings = { videoId: 'dQw4w9WgXcQ' };
      await action.onKeyDown(ev);
      expect(mockMethods.addTrack).toHaveBeenCalledWith('dQw4w9WgXcQ', false);
    });

    it('should pass forcePlay when set', async () => {
      const action = new AddTrackAction() as any;
      const ev = createKeyEvent();
      ev.payload.settings = { videoId: 'dQw4w9WgXcQ', forcePlay: true };
      await action.onKeyDown(ev);
      expect(mockMethods.addTrack).toHaveBeenCalledWith('dQw4w9WgXcQ', true);
    });

    it('should show warning when videoId is missing', async () => {
      const action = new AddTrackAction() as any;
      const ev = createKeyEvent();
      ev.payload.settings = {};
      await action.onKeyDown(ev);
      expect(mockMethods.addTrack).not.toHaveBeenCalled();
      expect(ev.action.setImage).toHaveBeenCalledWith('imgs/actions/warning');
    });
  });

  describe('AddPlaylistAction', () => {
    it('should call apiClient.addPlaylist with playlistId', async () => {
      const action = new AddPlaylistAction() as any;
      const ev = createKeyEvent();
      ev.payload.settings = { playlistId: 'PL123' };
      await action.onKeyDown(ev);
      expect(mockMethods.addPlaylist).toHaveBeenCalledWith('PL123', false, false);
    });

    it('should pass forcePlay and shuffle', async () => {
      const action = new AddPlaylistAction() as any;
      const ev = createKeyEvent();
      ev.payload.settings = { playlistId: 'PL456', forcePlay: true, shuffle: true };
      await action.onKeyDown(ev);
      expect(mockMethods.addPlaylist).toHaveBeenCalledWith('PL456', true, true);
    });

    it('should show warning when playlistId is missing', async () => {
      const action = new AddPlaylistAction() as any;
      const ev = createKeyEvent();
      ev.payload.settings = {};
      await action.onKeyDown(ev);
      expect(mockMethods.addPlaylist).not.toHaveBeenCalled();
      expect(ev.action.setImage).toHaveBeenCalledWith('imgs/actions/warning');
    });
  });
});
