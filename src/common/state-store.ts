import type { PlayerState } from './types.js';

/** Default player state before any WS events arrive */
const DEFAULT_STATE: PlayerState = {
  volume: 100,
  isPlaying: false,
  song: null,
  position: 0,
  muted: false,
  shuffle: false,
  repeat: 'off',
  isLiked: false,
  isDisliked: false,
};

type StateListener = (state: PlayerState) => void;

/**
 * Caches player state from WebSocket events.
 * Volume is WS-only per bug #4458 — never modified via REST.
 * Actions read from this store; REST calls are fire-and-forget.
 */
export class StateStore {
  private state: PlayerState;
  private listeners: Set<StateListener>;

  constructor() {
    this.state = { ...DEFAULT_STATE };
    this.listeners = new Set();
  }

  /** Get the full player state snapshot */
  getState(): PlayerState {
    return { ...this.state };
  }

  /** Get a single state field */
  get<K extends keyof PlayerState>(key: K): PlayerState[K] {
    return this.state[key];
  }

  /** Merge a partial update from a WS event into the cached state */
  update(delta: Partial<PlayerState>): void {
    this.state = { ...this.state, ...delta };
    this.notify();
  }

  /** Subscribe to state changes. Returns an unsubscribe function. */
  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const snapshot = this.getState();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}

/** Singleton state store instance */
export const stateStore = new StateStore();
