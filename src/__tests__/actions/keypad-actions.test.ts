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
  LikeAction, DislikeAction, ShuffleAction, RepeatAction }
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
});
