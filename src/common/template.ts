import type { SongInfo } from './types.js';

/**
 * Replace template tokens with song metadata.
 * Supported tokens: {title}, {artist}, {album}
 */
export function applyTemplate(template: string, song: SongInfo): string {
  return template
    .replace(/\{title\}/g, song.title)
    .replace(/\{artist\}/g, song.artist)
    .replace(/\{album\}/g, song.album);
}
