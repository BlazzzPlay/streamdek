import { describe, it, expect } from '@jest/globals';
import { applyTemplate } from '../../common/template';

describe('applyTemplate', () => {
  const song = {
    title: 'Bohemian Rhapsody',
    artist: 'Queen',
    album: 'A Night at the Opera',
    duration: 354,
    thumbnailUrl: 'https://example.com/thumb.jpg',
  };

  it('should replace {title} token', () => {
    expect(applyTemplate('{title}', song)).toBe('Bohemian Rhapsody');
  });

  it('should replace {artist} token', () => {
    expect(applyTemplate('{artist}', song)).toBe('Queen');
  });

  it('should replace {album} token', () => {
    expect(applyTemplate('{album}', song)).toBe('A Night at the Opera');
  });

  it('should replace multiple tokens in one template', () => {
    expect(applyTemplate('{title} - {artist}', song)).toBe('Bohemian Rhapsody - Queen');
  });

  it('should replace all occurrences of the same token', () => {
    expect(applyTemplate('{title} by {title}', song)).toBe('Bohemian Rhapsody by Bohemian Rhapsody');
  });

  it('should handle complex templates', () => {
    expect(applyTemplate('{title}\n{artist}\n{album}', song))
      .toBe('Bohemian Rhapsody\nQueen\nA Night at the Opera');
  });

  it('should leave unknown tokens untouched', () => {
    expect(applyTemplate('{unknown}', song)).toBe('{unknown}');
  });

  it('should leave plain text unchanged', () => {
    expect(applyTemplate('Now Playing', song)).toBe('Now Playing');
  });

  it('should handle empty template', () => {
    expect(applyTemplate('', song)).toBe('');
  });
});
