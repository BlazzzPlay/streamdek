import { SingletonAction, action } from '@elgato/streamdeck';
import type { WillAppearEvent, WillDisappearEvent } from '@elgato/streamdeck';
import { apiClient } from '../common/api-client.js';
import { connectionManager } from '../common/connection-manager.js';
import { stateStore } from '../common/state-store.js';
import { applyTemplate } from '../common/template.js';
import type { PluginSettings, SongInfo } from '../common/types.js';

/** Action settings from the Property Inspector */
interface ArtworkSettings {
  showTrackInfo?: boolean;
  textTemplate?: string;
  showProgressBar?: boolean;
}

const DEFAULT_TEMPLATE = '{title}\n{artist}';

/**
 * Artwork action — shows album art with optional text overlay on a Stream Deck key.
 *
 * Lifecycle:
 *   onWillAppear  → subscribe to state changes, render current song
 *   onWillDisappear → unsubscribe
 *   VIDEO_CHANGED → re-render when song changes
 */
@action({ UUID: 'com.streamdek.controller.artwork' })
export class ArtworkAction extends SingletonAction<PluginSettings> {
  private unsubscribe: (() => void) | null = null;

  async onWillAppear(ev: WillAppearEvent<PluginSettings>): Promise<void> {
    // Subscribe to state changes to re-render when song changes
    this.unsubscribe = stateStore.subscribe(() => {
      this.renderArtwork(ev).catch(() => {});
    });

    // Initial render
    await this.renderArtwork(ev);
  }

  onWillDisappear(_ev: WillDisappearEvent<PluginSettings>): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  /**
   * Fetch album art and render it on the key with optional text overlay.
   */
  private async renderArtwork(ev: WillAppearEvent<PluginSettings>): Promise<void> {
    if (!connectionManager.isAuthenticated()) {
      await ev.action.setImage('imgs/actions/warning');
      return;
    }

    try {
      const settings = (ev.payload?.settings ?? {}) as ArtworkSettings;
      const song = stateStore.get('song');

      if (!song || !song.thumbnailUrl) {
        // No song playing — show placeholder
        await ev.action.setImage('imgs/actions/artwork/artwork');
        return;
      }

      // Fetch and set album art
      const imageData = await this.fetchImageAsBase64(song.thumbnailUrl);
      if (imageData) {
        await ev.action.setImage(imageData);
      }

      // Apply text template overlay
      if (settings.showTrackInfo !== false) {
        const tpl = settings.textTemplate || DEFAULT_TEMPLATE;
        const titleText = applyTemplate(tpl, song);
        await ev.action.setTitle(titleText);
      }

      // Progress bar: use setFeedback with bar layout
      // On keypad actions, this won't have a native bar, but we show position via title
      if (settings.showProgressBar && song.duration > 0) {
        const pos = stateStore.get('position');
        const percent = Math.round((pos / song.duration) * 100);
        const bar = this.buildProgressBar(percent);

        if (settings.showTrackInfo !== false) {
          // Append progress bar to title
          const tpl = settings.textTemplate || DEFAULT_TEMPLATE;
          const titleText = applyTemplate(tpl, song);
          await ev.action.setTitle(`${titleText}\n${bar}`);
        } else {
          await ev.action.setTitle(bar);
        }
      }
    } catch {
      await ev.action.setImage('imgs/actions/warning');
    }
  }

  /**
   * Fetch an image URL and convert it to a base64 data URL.
   * Works with the Stream Deck `setImage()` which accepts data URLs.
   */
  private async fetchImageAsBase64(url: string): Promise<string | null> {
    try {
      const response = await fetch(url);
      if (!response.ok) return null;

      const buffer = await response.arrayBuffer();
      const base64 = btoa(
        String.fromCharCode(...new Uint8Array(buffer)),
      );

      // Determine MIME type — default to image/jpeg
      return `data:image/jpeg;base64,${base64}`;
    } catch {
      return null;
    }
  }

  /**
   * Build a text-based progress bar for use in setTitle().
   * 8-character bar with filled/empty blocks.
   */
  private buildProgressBar(percent: number): string {
    const width = 8;
    const filled = Math.round((percent / 100) * width);
    const empty = width - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
  }
}
