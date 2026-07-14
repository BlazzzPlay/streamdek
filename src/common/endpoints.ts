/** Base path for pear-desktop REST API */
export const API_BASE = '/api/v1';

/** Authentication endpoint */
export const AUTH_PATH = '/auth';

/** REST endpoint paths — match the real pear-desktop API Server */
export const ENDPOINTS = {
  TOGGLE_PLAY: `${API_BASE}/toggle-play`,
  NEXT: `${API_BASE}/next`,
  PREVIOUS: `${API_BASE}/previous`,
  LIKE: `${API_BASE}/like`,
  DISLIKE: `${API_BASE}/dislike`,
  SHUFFLE: `${API_BASE}/shuffle`,
  SWITCH_REPEAT: `${API_BASE}/switch-repeat`,
  VOLUME: `${API_BASE}/volume`,
  TOGGLE_MUTE: `${API_BASE}/toggle-mute`,
  SEEK_TO: `${API_BASE}/seek-to`,
  SONG: `${API_BASE}/song`,
} as const;

/** Default pear-desktop host and port */
export const DEFAULT_HOST = 'localhost';
export const DEFAULT_PORT = 26538;

/** Probe timeout in milliseconds */
export const PROBE_TIMEOUT_MS = 3000;

/** REST request timeout in milliseconds */
export const REQUEST_TIMEOUT_MS = 5000;

/** Authentication timeout in milliseconds */
export const AUTH_TIMEOUT_MS = 30000;

/** WebSocket path — token is passed as query param */
export const WS_PATH = '/api/v1/ws';
