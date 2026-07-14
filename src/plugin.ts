import streamDeck from '@elgato/streamdeck';
import { apiClient } from './common/api-client.js';
import { wsClient } from './common/ws-client.js';
import { stateStore } from './common/state-store.js';
import { initConnectionManager } from './common/connection-manager.js';
import { logger } from './common/logger.js';

// Import action classes (decorators auto-register them with the SDK)
import './actions/keypad-actions.js';
import './actions/encoder-actions.js';

/**
 * Streamdek plugin entry point.
 *
 * 1. Initialize singleton services
 * 2. Connect to pear-desktop when settings are available
 * 3. Register actions (done via @action decorators on import)
 */
async function main(): Promise<void> {
  // Initialize connection manager with injected services
  const connectionManager = initConnectionManager(apiClient, wsClient);

  // Load saved settings and attempt auto-connect
  streamDeck.settings.getGlobalSettings().then((settings: any) => {
    const host = settings.host || 'localhost';
    const port = settings.port || 26538;
    const jwt = settings.jwt || '';

    if (jwt) {
      logger.info(`Connecting to pear-desktop at ${host}:${port}`);
      connectionManager.connect(host, port, jwt);
    } else {
      logger.info('No JWT configured — waiting for Property Inspector setup');
    }
  });

  // Subscribe WS events to StateStore
  wsClient.subscribe('player:state', (data: any) => {
    stateStore.update({
      isPlaying: data.isPlaying,
      currentPosition: data.currentPosition,
      trackDuration: data.trackDuration,
    });
  });

  wsClient.subscribe('player:track', (data: any) => {
    stateStore.update({
      currentTrack: data.title,
      currentArtist: data.artist,
      currentAlbum: data.album,
    });
  });

  wsClient.subscribe('player:volume', (data: any) => {
    stateStore.update({
      volume: data.volume,
      isMuted: data.isMuted,
    });
  });

  wsClient.subscribe('player:like', (data: any) => {
    stateStore.update({
      isLiked: data.isLiked,
      isDisliked: data.isDisliked,
    });
  });

  wsClient.subscribe('player:shuffle', (data: any) => {
    stateStore.update({
      isShuffled: data.isShuffled,
    });
  });

  wsClient.subscribe('player:repeat', (data: any) => {
    stateStore.update({
      repeatMode: data.repeatMode,
    });
  });

  // Connect to Stream Deck
  await streamDeck.connect();
  logger.info('Streamdek plugin started');
}

main().catch((err) => {
  logger.error(`Plugin startup failed: ${String(err)}`);
});
