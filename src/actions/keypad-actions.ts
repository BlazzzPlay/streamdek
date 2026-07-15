import { SingletonAction, action } from '@elgato/streamdeck';
import type { KeyDownEvent } from '@elgato/streamdeck';
import { apiClient } from '../common/api-client.js';
import { connectionManager } from '../common/connection-manager.js';
import { stateStore } from '../common/state-store.js';
import type { PluginSettings } from '../common/types.js';

/**
 * Base behavior for all Stream Dek actions:
 * - Checks connection state before executing
 * - Shows warning icon when disconnected
 * - Per-action try/catch error boundary
 */
abstract class BaseKeypadAction extends SingletonAction<PluginSettings> {
  /**
   * Execute the action if authenticated. Otherwise show warning.
   */
  protected async executeIfReady(
    ev: KeyDownEvent<PluginSettings>,
    fn: () => Promise<void>,
  ): Promise<void> {
    if (!connectionManager.isAuthenticated()) {
      await ev.action.setImage('imgs/actions/warning');
      return;
    }

    try {
      await fn();
    } catch {
      await ev.action.setImage('imgs/actions/warning');
    }
  }
}

@action({ UUID: 'com.streamdek.play-pause' })
export class PlayPauseAction extends BaseKeypadAction {
  async onKeyDown(ev: KeyDownEvent<PluginSettings>): Promise<void> {
    await this.executeIfReady(ev, async () => {
      await apiClient.togglePlay();
      const isPlaying = stateStore.get('isPlaying');
      await ev.action.setState(isPlaying ? 1 : 0);
    });
  }
}

@action({ UUID: 'com.streamdek.next-track' })
export class NextTrackAction extends BaseKeypadAction {
  async onKeyDown(ev: KeyDownEvent<PluginSettings>): Promise<void> {
    await this.executeIfReady(ev, async () => {
      await apiClient.next();
    });
  }
}

@action({ UUID: 'com.streamdek.previous-track' })
export class PreviousTrackAction extends BaseKeypadAction {
  async onKeyDown(ev: KeyDownEvent<PluginSettings>): Promise<void> {
    await this.executeIfReady(ev, async () => {
      await apiClient.previous();
    });
  }
}

@action({ UUID: 'com.streamdek.like' })
export class LikeAction extends BaseKeypadAction {
  async onKeyDown(ev: KeyDownEvent<PluginSettings>): Promise<void> {
    await this.executeIfReady(ev, async () => {
      await apiClient.like();
      const isLiked = stateStore.get('isLiked');
      await ev.action.setState(isLiked ? 1 : 0);
    });
  }
}

@action({ UUID: 'com.streamdek.dislike' })
export class DislikeAction extends BaseKeypadAction {
  async onKeyDown(ev: KeyDownEvent<PluginSettings>): Promise<void> {
    await this.executeIfReady(ev, async () => {
      await apiClient.dislike();
      const isDisliked = stateStore.get('isDisliked');
      await ev.action.setState(isDisliked ? 1 : 0);
    });
  }
}

@action({ UUID: 'com.streamdek.shuffle' })
export class ShuffleAction extends BaseKeypadAction {
  async onKeyDown(ev: KeyDownEvent<PluginSettings>): Promise<void> {
    await this.executeIfReady(ev, async () => {
      await apiClient.shuffle();
      const shuffle = stateStore.get('shuffle');
      await ev.action.setState(shuffle ? 1 : 0);
    });
  }
}

@action({ UUID: 'com.streamdek.repeat' })
export class RepeatAction extends BaseKeypadAction {
  async onKeyDown(ev: KeyDownEvent<PluginSettings>): Promise<void> {
    await this.executeIfReady(ev, async () => {
      const mode = stateStore.get('repeat');
      const modeMap: Record<string, number> = { off: 0, one: 1, all: 2 };
      const nextIteration = ((modeMap[mode] ?? 0) + 1) % 3;
      await apiClient.switchRepeat(nextIteration);
      const stateMap: Record<number, number> = { 0: 0, 1: 1, 2: 2 };
      await ev.action.setState(stateMap[nextIteration]);
    });
  }
}

@action({ UUID: 'com.streamdek.go-forward' })
export class GoForwardAction extends BaseKeypadAction {
  async onKeyDown(ev: KeyDownEvent<PluginSettings>): Promise<void> {
    await this.executeIfReady(ev, async () => {
      const seconds = (ev.payload.settings as { seconds?: number })?.seconds ?? 10;
      await apiClient.goForward(seconds);
      await ev.action.showOk();
    });
  }
}

@action({ UUID: 'com.streamdek.go-back' })
export class GoBackAction extends BaseKeypadAction {
  async onKeyDown(ev: KeyDownEvent<PluginSettings>): Promise<void> {
    await this.executeIfReady(ev, async () => {
      const seconds = (ev.payload.settings as { seconds?: number })?.seconds ?? 10;
      await apiClient.goBack(seconds);
      await ev.action.showOk();
    });
  }
}

@action({ UUID: 'com.streamdek.set-volume' })
export class SetVolumeAction extends BaseKeypadAction {
  async onKeyDown(ev: KeyDownEvent<PluginSettings>): Promise<void> {
    await this.executeIfReady(ev, async () => {
      const volume = (ev.payload.settings as { volume?: number })?.volume ?? 50;
      const clamped = Math.max(0, Math.min(100, volume));
      await apiClient.setVolume(clamped);
      await ev.action.showOk();
    });
  }
}

@action({ UUID: 'com.streamdek.add-track' })
export class AddTrackAction extends BaseKeypadAction {
  async onKeyDown(ev: KeyDownEvent<PluginSettings>): Promise<void> {
    await this.executeIfReady(ev, async () => {
      const settings = ev.payload.settings as { videoId?: string; forcePlay?: boolean };
      const videoId = settings?.videoId;
      if (!videoId) {
        await ev.action.setImage('imgs/actions/warning');
        return;
      }
      const forcePlay = settings?.forcePlay ?? false;
      await apiClient.addTrack(videoId, forcePlay);
      await ev.action.showOk();
    });
  }
}

@action({ UUID: 'com.streamdek.add-playlist' })
export class AddPlaylistAction extends BaseKeypadAction {
  async onKeyDown(ev: KeyDownEvent<PluginSettings>): Promise<void> {
    await this.executeIfReady(ev, async () => {
      const settings = ev.payload.settings as {
        playlistId?: string;
        forcePlay?: boolean;
        shuffle?: boolean;
      };
      const playlistId = settings?.playlistId;
      if (!playlistId) {
        await ev.action.setImage('imgs/actions/warning');
        return;
      }
      const forcePlay = settings?.forcePlay ?? false;
      const shuffle = settings?.shuffle ?? false;
      await apiClient.addPlaylist(playlistId, forcePlay, shuffle);
      await ev.action.showOk();
    });
  }
}
