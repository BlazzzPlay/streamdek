/**
 * Player state cached from WebSocket events.
 * Volume is WS-only per bug #4458 — never read-modify-write via REST.
 */
export interface PlayerState {
  volume: number; // 0–100
  isPlaying: boolean;
  currentTrack: string | null;
  currentArtist: string | null;
  currentAlbum: string | null;
  currentPosition: number; // seconds
  trackDuration: number; // seconds
  isMuted: boolean;
  isShuffled: boolean;
  repeatMode: 'off' | 'one' | 'all';
  isLiked: boolean;
  isDisliked: boolean;
}

/** Connection state machine states */
export type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'authenticating'
  | 'authenticated';

/** JSON-compatible value type (recursive) */
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** Application settings persisted via Property Inspector */
export interface PluginSettings {
  host?: string;
  port?: number;
  jwt?: string;
  [key: string]: JsonValue | undefined;
}

/** Peer-desktop WebSocket event types mapped to handler signatures */
export type WsEventType =
  | 'player:state'
  | 'player:track'
  | 'player:playback'
  | 'player:volume'
  | 'player:like'
  | 'player:shuffle'
  | 'player:repeat';

/** Callback for WebSocket event subscribers */
export type WsEventHandler = (data: unknown) => void;
