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
      await apiClient.playPause();
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
      const isShuffled = stateStore.get('isShuffled');
      await ev.action.setState(isShuffled ? 1 : 0);
    });
  }
}

@action({ UUID: 'com.streamdek.repeat' })
export class RepeatAction extends BaseKeypadAction {
  async onKeyDown(ev: KeyDownEvent<PluginSettings>): Promise<void> {
    await this.executeIfReady(ev, async () => {
      await apiClient.repeat();
      const mode = stateStore.get('repeatMode');
      const stateMap: Record<string, number> = { off: 0, one: 1, all: 2 };
      await ev.action.setState(stateMap[mode] ?? 0);
    });
  }
}
