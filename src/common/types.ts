/**
 * Player state cached from WebSocket events.
 * Volume is WS-only per bug #4458 — never read-modify-write via REST.
 * Field names match the real pear-desktop API Server WS event payload.
 */
export interface PlayerState {
  volume: number; // 0–100
  isPlaying: boolean;
  song: SongInfo | null;
  position: number; // seconds
  muted: boolean;
  shuffle: boolean;
  repeat: 'off' | 'one' | 'all';
  isLiked: boolean;
  isDisliked: boolean;
}

/** Song metadata from the pear-desktop API */
export interface SongInfo {
  title: string;
  artist: string;
  album: string;
  duration: number; // seconds
  thumbnailUrl: string;
}

/** Connection state machine states */
export type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'authenticated';

/** JSON-compatible value type (recursive) */
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** Application settings persisted via Property Inspector */
export interface PluginSettings {
  host?: string;
  port?: number;
  [key: string]: JsonValue | undefined;
}

/** pear-desktop WebSocket event types from the real API Server */
export type WsEventType =
  | 'PLAYER_INFO'
  | 'VIDEO_CHANGED'
  | 'PLAYER_STATE_CHANGED'
  | 'POSITION_CHANGED'
  | 'VOLUME_CHANGED'
  | 'REPEAT_CHANGED'
  | 'SHUFFLE_CHANGED';

/** Callback for WebSocket event subscribers */
export type WsEventHandler = (data: unknown) => void;
