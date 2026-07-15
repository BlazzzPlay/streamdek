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

/**
 * Generate a persistent client ID for this Stream Deck instance.
 * Stored in global settings so it survives plugin restarts.
 */
function generateClientId(): string {
  const randomPart = Math.random().toString(36).substring(2, 10);
  return `streamdek-${randomPart}`;
}

/**
 * Streamdek plugin entry point.
 *
 * Flow:
 *  1. Load or generate a persistent clientId
 *  2. Connect to pear-desktop (probe host:port)
 *  3. Authenticate via POST /auth/{clientId}
 *  4. Start WebSocket for real-time state updates
 *  5. Subscribe WS events to StateStore
 */
async function main(): Promise<void> {
  // Initialize connection manager with injected services
  const connectionManager = initConnectionManager(apiClient, wsClient);

  // Load saved settings and attempt auto-connect
  const settings = await streamDeck.settings.getGlobalSettings() as PluginSettings;
  const host = settings.host || DEFAULT_HOST;
  const port = settings.port || DEFAULT_PORT;
  const useAuth = settings.useAuth === true; // default: false (no auth)

  // Generate or retrieve persistent clientId
  let clientId = settings.clientId;
  if (!clientId) {
    clientId = generateClientId();
    await streamDeck.settings.setGlobalSettings({
      ...settings,
      clientId,
    });
    logger.info(`Generated new clientId: ${clientId}`);
  }

  // Load existing access token if available
  if (settings.accessToken) {
    apiClient.setToken(settings.accessToken);
  } else if (!useAuth) {
    // No auth mode: clear any stale token
    apiClient.setToken('');
  }

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

  // Connect and authenticate
  logger.info(`Connecting to pear-desktop at ${host}:${port} (useAuth=${useAuth})`);
  connectionManager.connect(host, port, useAuth);

  // Listen for state changes to initiate auth when probe succeeds
  connectionManager.onStateChange(async (state) => {
    if (state === 'connected') {
      logger.info('Probe successful — initiating authentication');
      try {
        await connectionManager.authenticate(clientId!);
        logger.info('Authentication successful');
        // Persist settings for reconnection
        await streamDeck.settings.setGlobalSettings({
          ...settings,
          clientId,
          host,
          port,
          useAuth,
          accessToken: useAuth ? apiClient['accessToken'] : '',
        });
      } catch (err) {
        logger.error(`Authentication failed: ${String(err)}`);
      }
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
    connectionManager.connect(newHost, newPort, newSettings.useAuth === true);

    if (newSettings.clientId) {
      clientId = newSettings.clientId;
    }
  });

  // Connect to Stream Deck
  await streamDeck.connect();
  logger.info('Streamdek plugin started');
}

main().catch((err) => {
  logger.error(`Plugin startup failed: ${String(err)}`);
});
