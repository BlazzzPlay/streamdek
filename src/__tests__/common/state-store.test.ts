import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { StateStore } from '../../common/state-store';

describe('StateStore', () => {
  let store: StateStore;

  beforeEach(() => {
    store = new StateStore();
  });

  describe('initial state', () => {
    it('should have default values matching real API', () => {
      const state = store.getState();

      expect(state.volume).toBe(100);
      expect(state.isPlaying).toBe(false);
      expect(state.song).toBeNull();
      expect(state.position).toBe(0);
      expect(state.muted).toBe(false);
      expect(state.shuffle).toBe(false);
      expect(state.repeat).toBe('off');
      expect(state.isLiked).toBe(false);
      expect(state.isDisliked).toBe(false);
    });

    it('should return individual fields via get()', () => {
      expect(store.get('volume')).toBe(100);
      expect(store.get('isPlaying')).toBe(false);
      expect(store.get('repeat')).toBe('off');
      expect(store.get('position')).toBe(0);
      expect(store.get('muted')).toBe(false);
      expect(store.get('shuffle')).toBe(false);
    });
  });

  describe('partial updates', () => {
    it('should merge partial updates into the state', () => {
      store.update({ isPlaying: true, volume: 75 });

      expect(store.get('isPlaying')).toBe(true);
      expect(store.get('volume')).toBe(75);
      // Unchanged fields retain defaults
      expect(store.get('muted')).toBe(false);
      expect(store.get('repeat')).toBe('off');
    });

    it('should update multiple unrelated fields across calls', () => {
      store.update({ isPlaying: true });
      store.update({ shuffle: true });
      store.update({ repeat: 'one' });

      expect(store.get('isPlaying')).toBe(true);
      expect(store.get('shuffle')).toBe(true);
      expect(store.get('repeat')).toBe('one');
      expect(store.get('volume')).toBe(100); // untouched
    });

    it('should update the same field multiple times', () => {
      store.update({ volume: 50 });
      expect(store.get('volume')).toBe(50);

      store.update({ volume: 30 });
      expect(store.get('volume')).toBe(30);

      store.update({ volume: 80 });
      expect(store.get('volume')).toBe(80);
    });

    it('should handle empty updates gracefully', () => {
      store.update({});
      const state = store.getState();
      expect(state.volume).toBe(100);
      expect(state.isPlaying).toBe(false);
    });

    it('should update song metadata (from PLAYER_INFO / VIDEO_CHANGED)', () => {
      store.update({
        song: {
          title: 'Bohemian Rhapsody',
          artist: 'Queen',
          album: 'A Night at the Opera',
          duration: 354,
          thumbnailUrl: 'https://example.com/thumb.jpg',
        },
      });

      expect(store.get('song')).toEqual({
        title: 'Bohemian Rhapsody',
        artist: 'Queen',
        album: 'A Night at the Opera',
        duration: 354,
        thumbnailUrl: 'https://example.com/thumb.jpg',
      });
    });

    it('should update position from POSITION_CHANGED event', () => {
      store.update({ position: 142 });

      expect(store.get('position')).toBe(142);
    });

    it('should update muted state from VOLUME_CHANGED event', () => {
      store.update({ muted: true, volume: 100 });

      expect(store.get('muted')).toBe(true);
      expect(store.get('volume')).toBe(100);
    });

    it('should update shuffle from SHUFFLE_CHANGED event', () => {
      store.update({ shuffle: true });

      expect(store.get('shuffle')).toBe(true);
      expect(store.get('shuffle')).not.toBe(false);
    });
  });

  describe('volume is WS-only (bug #4458)', () => {
    it('should update volume from WS event', () => {
      store.update({ volume: 42 });

      expect(store.get('volume')).toBe(42);
    });
  });

  describe('subscriber notifications', () => {
    it('should notify subscribers on update', () => {
      const listener = jest.fn();
      store.subscribe(listener);
      store.update({ isPlaying: true });

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('should pass the full state to subscribers', () => {
      const listener = jest.fn();
      store.subscribe(listener);
      store.update({ volume: 75, isPlaying: true });

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ volume: 75, isPlaying: true })
      );
    });

    it('should NOT notify unsubscribed listeners', () => {
      const listener = jest.fn();
      const unsubscribe = store.subscribe(listener);
      unsubscribe();

      store.update({ isPlaying: true });
      expect(listener).not.toHaveBeenCalled();
    });

    it('should support multiple subscribers', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();

      store.subscribe(listener1);
      store.subscribe(listener2);
      store.update({ volume: 50 });

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
    });

    it('should pass delta to subscribers', () => {
      const listener = jest.fn();
      store.subscribe(listener);
      store.update({ isLiked: true });

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ isLiked: true })
      );
    });

    it('should not notify if no listeners', () => {
      // Should not throw
      expect(() => store.update({ volume: 10 })).not.toThrow();
    });
  });
});
