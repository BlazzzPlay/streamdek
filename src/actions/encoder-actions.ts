import { SingletonAction, action } from '@elgato/streamdeck';
import type { DialRotateEvent, DialDownEvent, DidReceiveSettingsEvent } from '@elgato/streamdeck';
import { apiClient } from '../common/api-client.js';
import { connectionManager } from '../common/connection-manager.js';
import { stateStore } from '../common/state-store.js';
import type { PluginSettings } from '../common/types.js';

/**
 * Base behavior for encoder (dial) actions:
 * - Checks connection state before executing
 * - Shows warning state when disconnected
 * - Per-action try/catch error boundary
 */
abstract class BaseEncoderAction extends SingletonAction<PluginSettings> {
  constructor() {
    super();

    // Show warning on encoder display when connection drops
    connectionManager.onStateChange((state) => {
      if (state !== 'authenticated') {
        this.showDisconnectedWarning();
      }
    });
  }

  protected async executeIfReady(fn: () => Promise<void>): Promise<void> {
    if (!connectionManager.isAuthenticated()) {
      this.showDisconnectedWarning();
      return;
    }

    try {
      await fn();
    } catch {
      // Silently fail — warning state will be shown via ConnectionManager listener
    }
  }

  /**
   * Show a warning indicator on the encoder touch strip when pear-desktop is unreachable.
   */
  protected showDisconnectedWarning(): void {
    for (const action of this.actions) {
      (action as any).setFeedback?.({ title: '⚠ Offline' }).catch(() => {});
    }
  }

  /**
   * Update feedback layout with current value text.
   */
  protected updateFeedback(value: string): void {
    if (!connectionManager.isAuthenticated()) return;

    for (const action of this.actions) {
      (action as any).setFeedback?.({ title: value }).catch(() => {});
    }
  }
}

/**
 * Volume encoder action.
 * Rotate: adjust volume ±2 (from WS cache, bug #4458)
 * Press: toggle mute
 */
@action({ UUID: 'com.streamdek.volume' })
export class VolumeAction extends BaseEncoderAction {
  async onDialRotate(ev: DialRotateEvent<PluginSettings>): Promise<void> {
    await this.executeIfReady(async () => {
      const ticks = ev.payload.ticks;
      const delta = ticks * 2; // ±2 per tick
      const currentVol = stateStore.get('volume');
      const muted = stateStore.get('muted');

      // If muted and rotating up, unmute first
      if (muted && delta > 0) {
        // Unmute at current volume level
        const newVol = Math.max(0, Math.min(100, currentVol));
        await apiClient.setVolume(newVol);
        this.updateFeedback(`Vol: ${newVol}`);
        return;
      }

      const newVol = Math.max(0, Math.min(100, currentVol + delta));
      await apiClient.setVolume(newVol);
      this.updateFeedback(`Vol: ${newVol}`);
    });
  }

  async onDialDown(ev: DialDownEvent<PluginSettings>): Promise<void> {
    await this.executeIfReady(async () => {
      const muted = stateStore.get('muted');
      if (muted) {
        const currentVol = stateStore.get('volume');
        await apiClient.setVolume(currentVol);
        this.updateFeedback(`Vol: ${currentVol}`);
      } else {
        await apiClient.setVolume(0);
        this.updateFeedback('Muted');
      }
    });
  }

  async onDidReceiveSettings(ev: DidReceiveSettingsEvent<PluginSettings>): Promise<void> {
    // PI sends settings; update connection when JWT/host/port change
  }
}

/**
 * Seek encoder action.
 * Rotate: seek ±5 seconds
 * Press: play/pause
 */
@action({ UUID: 'com.streamdek.seek' })
export class SeekAction extends BaseEncoderAction {
  async onDialRotate(ev: DialRotateEvent<PluginSettings>): Promise<void> {
    await this.executeIfReady(async () => {
      const ticks = ev.payload.ticks;
      const delta = ticks * 5; // ±5s per tick
      const currentPos = stateStore.get('position');
      const song = stateStore.get('song');
      const duration = song?.duration ?? 0;

      const newPos = Math.max(0, Math.min(duration || 9999, currentPos + delta));
      await apiClient.seekTo(newPos);
      this.updateFeedback(formatTime(newPos));
    });
  }

  async onDialDown(_ev: DialDownEvent<PluginSettings>): Promise<void> {
    await this.executeIfReady(async () => {
      await apiClient.togglePlay();
    });
  }
}

/** Format seconds as mm:ss */
function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
