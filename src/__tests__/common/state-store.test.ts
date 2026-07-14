import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { StateStore } from '../../common/state-store';

describe('StateStore', () => {
  let store: StateStore;

  beforeEach(() => {
    store = new StateStore();
  });

  describe('initial state', () => {
    it('should have default values', () => {
      const state = store.getState();

      expect(state.volume).toBe(100);
      expect(state.isPlaying).toBe(false);
      expect(state.currentTrack).toBeNull();
      expect(state.currentArtist).toBeNull();
      expect(state.currentAlbum).toBeNull();
      expect(state.currentPosition).toBe(0);
      expect(state.trackDuration).toBe(0);
      expect(state.isMuted).toBe(false);
      expect(state.isShuffled).toBe(false);
      expect(state.repeatMode).toBe('off');
      expect(state.isLiked).toBe(false);
      expect(state.isDisliked).toBe(false);
    });

    it('should return individual fields via get()', () => {
      expect(store.get('volume')).toBe(100);
      expect(store.get('isPlaying')).toBe(false);
      expect(store.get('repeatMode')).toBe('off');
    });
  });

  describe('partial updates', () => {
    it('should merge partial updates into the state', () => {
      store.update({ isPlaying: true, volume: 75 });

      expect(store.get('isPlaying')).toBe(true);
      expect(store.get('volume')).toBe(75);
      // Unchanged fields retain defaults
      expect(store.get('isMuted')).toBe(false);
      expect(store.get('repeatMode')).toBe('off');
    });

    it('should update multiple unrelated fields across calls', () => {
      store.update({ isPlaying: true });
      store.update({ isShuffled: true });
      store.update({ repeatMode: 'one' });

      expect(store.get('isPlaying')).toBe(true);
      expect(store.get('isShuffled')).toBe(true);
      expect(store.get('repeatMode')).toBe('one');
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

    it('should update track metadata fields', () => {
      store.update({
        currentTrack: 'Bohemian Rhapsody',
        currentArtist: 'Queen',
        currentAlbum: 'A Night at the Opera',
        trackDuration: 354,
      });

      expect(store.get('currentTrack')).toBe('Bohemian Rhapsody');
      expect(store.get('currentArtist')).toBe('Queen');
      expect(store.get('currentAlbum')).toBe('A Night at the Opera');
      expect(store.get('trackDuration')).toBe(354);
    });
  });

  describe('volume is WS-only (bug #4458)', () => {
    it('should update volume from WS event', () => {
      store.update({ volume: 42 });

      expect(store.get('volume')).toBe(42);
    });

    it('should track muted state from WS event', () => {
      store.update({ isMuted: true, volume: 100 });

      expect(store.get('isMuted')).toBe(true);
      expect(store.get('volume')).toBe(100);
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
      const delta = { isLiked: true };
      store.update(delta);

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
