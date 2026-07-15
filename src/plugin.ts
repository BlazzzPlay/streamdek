import streamDeck from '@elgato/streamdeck';
import { apiClient } from './common/api-client.js';
import { wsClient } from './common/ws-client.js';
import { stateStore } from './common/state-store.js';
import { initConnectionManager } from './common/connection-manager.js';
import { logger } from './common/logger.js';
import { DEFAULT_HOST, DEFAULT_PORT } from './common/endpoints.js';
import type { PluginSettings } from './common/types.js';

// Import action classes (decorators auto-register them with the SDK)
import './actions/keypad-actions.js';
import './actions/encoder-actions.js';
import './actions/artwork-action.js';

/**
 * Streamdek plugin entry point.
 *
 * Simplified flow (no auth — "No authorization" mode):
 *  1. Connect to pear-desktop (probe host:port)
 *  2. Probe OK → start WebSocket for real-time state updates
 *  3. Subscribe WS events to StateStore
 */
async function main(): Promise<void> {
  // Initialize connection manager with injected services
  const connectionManager = initConnectionManager(apiClient, wsClient);

  // Load saved settings and attempt auto-connect
  const settings = await streamDeck.settings.getGlobalSettings() as PluginSettings;
  const host = settings.host || DEFAULT_HOST;
  const port = settings.port || DEFAULT_PORT;

  // Subscribe WS events to StateStore using real pear-desktop event types
  wsClient.subscribe('PLAYER_INFO', (data: any) => {
    stateStore.update({
      song: data.song ?? null,
      isPlaying: data.isPlaying ?? false,
      volume: data.volume ?? 100,
      muted: data.muted ?? false,
      shuffle: data.shuffle ?? false,
      repeat: data.repeat ?? 'off',
      position: data.position ?? 0,
      isLiked: data.isLiked ?? false,
      isDisliked: data.isDisliked ?? false,
    });
  });

  wsClient.subscribe('PLAYER_STATE_CHANGED', (data: any) => {
    stateStore.update({
      isPlaying: data.isPlaying,
    });
  });

  wsClient.subscribe('VIDEO_CHANGED', (data: any) => {
    if (data.song) {
      stateStore.update({ song: data.song });
    }
  });

  wsClient.subscribe('POSITION_CHANGED', (data: any) => {
    stateStore.update({
      position: data.position,
    });
  });

  wsClient.subscribe('VOLUME_CHANGED', (data: any) => {
    stateStore.update({
      volume: data.volume,
      muted: data.muted,
    });
  });

  wsClient.subscribe('REPEAT_CHANGED', (data: any) => {
    stateStore.update({
      repeat: data.repeat,
    });
  });

  wsClient.subscribe('SHUFFLE_CHANGED', (data: any) => {
    stateStore.update({
      shuffle: data.shuffle,
    });
  });

  // Connect — probe then auto-start WebSocket on success
  logger.info(`Connecting to pear-desktop at ${host}:${port}`);
  connectionManager.connect(host, port);

  // Listen for state changes
  connectionManager.onStateChange(async (state) => {
    if (state === 'authenticated') {
      logger.info('Connected to pear-desktop');
      // Persist settings for reconnection
      await streamDeck.settings.setGlobalSettings({
        host,
        port,
      });
    }

    if (state === 'disconnected') {
      logger.info('Disconnected from pear-desktop');
    }
  });

  // Listen for settings changes from Property Inspector to reconnect
  streamDeck.settings.onDidReceiveGlobalSettings(async (ev: any) => {
    const newSettings = ev.payload?.settings as PluginSettings;
    if (!newSettings) return;

    const newHost = newSettings.host || DEFAULT_HOST;
    const newPort = newSettings.port || DEFAULT_PORT;

    logger.info(`Settings changed — reconnecting to ${newHost}:${newPort}`);
    connectionManager.disconnect();
    connectionManager.connect(newHost, newPort);
  });

  // Connect to Stream Deck
  await streamDeck.connect();
  logger.info('Streamdek Controller plugin started');
}

main().catch((err) => {
  logger.error(`Plugin startup failed: ${String(err)}`);
});
