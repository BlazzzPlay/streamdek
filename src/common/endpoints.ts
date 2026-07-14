/** Base path for pear-desktop REST API */
export const API_BASE = '/api/v1';

/** REST endpoint paths */
export const ENDPOINTS = {
  PLAY_PAUSE: `${API_BASE}/play-pause`,
  NEXT: `${API_BASE}/next`,
  PREVIOUS: `${API_BASE}/previous`,
  LIKE: `${API_BASE}/like`,
  DISLIKE: `${API_BASE}/dislike`,
  SHUFFLE: `${API_BASE}/shuffle`,
  REPEAT: `${API_BASE}/repeat`,
  VOLUME: `${API_BASE}/volume`,
  SEEK: `${API_BASE}/seek`,
  STATUS: `${API_BASE}/status`,
} as const;

/** Default pear-desktop host and port */
export const DEFAULT_HOST = 'localhost';
export const DEFAULT_PORT = 26538;

/** Probe timeout in milliseconds */
export const PROBE_TIMEOUT_MS = 3000;

/** REST request timeout in milliseconds */
export const REQUEST_TIMEOUT_MS = 5000;

/** WebSocket path */
export const WS_PATH = '/ws';
