import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const mockApiClient = {
  playPause: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  setVolume: jest.fn<(vol: number) => Promise<void>>().mockResolvedValue(undefined),
  seek: jest.fn<(pos: number) => Promise<void>>().mockResolvedValue(undefined),
};

const mockState = {
  volume: 80,
  isMuted: false,
  currentPosition: 120,
  trackDuration: 300,
  isPlaying: true,
};

const mockConnected = { value: true };

jest.unstable_mockModule('../../common/api-client', () => ({ apiClient: mockApiClient }));
jest.unstable_mockModule('../../common/state-store', () => ({
  stateStore: {
    get: (key: string) => (mockState as any)[key],
    subscribe: jest.fn().mockReturnValue(jest.fn()),
    update: jest.fn(),
  },
}));
jest.unstable_mockModule('../../common/connection-manager', () => ({
  connectionManager: { isAuthenticated: () => mockConnected.value, onStateChange: jest.fn() },
  initConnectionManager: jest.fn(),
}));
jest.unstable_mockModule('../../common/logger', () => ({
  logger: { isDebug: false, trace: jest.fn(), debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const { VolumeAction, SeekAction } = await import('../../actions/encoder-actions');

function createDialRotateEvent(ticks: number): any {
  return {
    action: {
      setFeedback: jest.fn().mockResolvedValue(undefined),
      setImage: jest.fn().mockResolvedValue(undefined),
    },
    payload: { settings: {}, ticks, controller: 'Encoder' },
  };
}

function createDialDownEvent(): any {
  return {
    action: {
      setFeedback: jest.fn().mockResolvedValue(undefined),
      setImage: jest.fn().mockResolvedValue(undefined),
    },
    payload: { settings: {}, controller: 'Encoder' },
  };
}

describe('Encoder Actions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConnected.value = true;
    mockState.volume = 80;
    mockState.isMuted = false;
    mockState.currentPosition = 120;
    mockState.trackDuration = 300;
  });

  describe('VolumeAction', () => {
    let action: VolumeAction;

    beforeEach(() => {
      action = new VolumeAction();
    });

    describe('onDialRotate', () => {
      it('should increase volume by 2 per clockwise tick', async () => {
        await action.onDialRotate!(createDialRotateEvent(1));
        expect(mockApiClient.setVolume).toHaveBeenCalledWith(82);
      });

      it('should decrease volume by 2 per counter-clockwise tick', async () => {
        await action.onDialRotate!(createDialRotateEvent(-1));
        expect(mockApiClient.setVolume).toHaveBeenCalledWith(78);
      });

      it('should not exceed 100', async () => {
        mockState.volume = 99;
        await action.onDialRotate!(createDialRotateEvent(2));
        expect(mockApiClient.setVolume).toHaveBeenCalledWith(100);
      });

      it('should not go below 0', async () => {
        mockState.volume = 1;
        await action.onDialRotate!(createDialRotateEvent(-2));
        expect(mockApiClient.setVolume).toHaveBeenCalledWith(0);
      });

      it('should NOT call API when not authenticated', async () => {
        mockConnected.value = false;
        await action.onDialRotate!(createDialRotateEvent(1));
        expect(mockApiClient.setVolume).not.toHaveBeenCalled();
      });
    });

    describe('onDialDown (mute toggle)', () => {
      it('should mute when unmuted', async () => {
        mockState.isMuted = false;
        await action.onDialDown!(createDialDownEvent());
        expect(mockApiClient.setVolume).toHaveBeenCalledWith(0);
      });

      it('should unmute to current volume when muted', async () => {
        mockState.isMuted = true;
        mockState.volume = 65;
        await action.onDialDown!(createDialDownEvent());
        expect(mockApiClient.setVolume).toHaveBeenCalledWith(65);
      });

      it('should NOT call API when not authenticated', async () => {
        mockConnected.value = false;
        await action.onDialDown!(createDialDownEvent());
        expect(mockApiClient.setVolume).not.toHaveBeenCalled();
      });
    });
  });

  describe('SeekAction', () => {
    let action: SeekAction;

    beforeEach(() => {
      action = new SeekAction();
    });

    describe('onDialRotate', () => {
      it('should seek forward by 5 seconds per clockwise tick', async () => {
        await action.onDialRotate!(createDialRotateEvent(1));
        expect(mockApiClient.seek).toHaveBeenCalledWith(125);
      });

      it('should seek backward by 5 seconds per counter-clockwise tick', async () => {
        await action.onDialRotate!(createDialRotateEvent(-1));
        expect(mockApiClient.seek).toHaveBeenCalledWith(115);
      });

      it('should not seek beyond track duration', async () => {
        mockState.currentPosition = 298;
        await action.onDialRotate!(createDialRotateEvent(1));
        expect(mockApiClient.seek).toHaveBeenCalledWith(300);
      });

      it('should not seek below 0', async () => {
        mockState.currentPosition = 2;
        await action.onDialRotate!(createDialRotateEvent(-2));
        expect(mockApiClient.seek).toHaveBeenCalledWith(0);
      });

      it('should NOT call API when not authenticated', async () => {
        mockConnected.value = false;
        await action.onDialRotate!(createDialRotateEvent(1));
        expect(mockApiClient.seek).not.toHaveBeenCalled();
      });
    });

    describe('onDialDown', () => {
      it('should toggle play/pause', async () => {
        await action.onDialDown!(createDialDownEvent());
        expect(mockApiClient.playPause).toHaveBeenCalled();
      });

      it('should NOT call API when not authenticated', async () => {
        mockConnected.value = false;
        await action.onDialDown!(createDialDownEvent());
        expect(mockApiClient.playPause).not.toHaveBeenCalled();
      });
    });
  });
});
