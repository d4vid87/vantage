import { describe, it, expect } from 'vitest';
import { mapWikiNews, stripHtml } from './wiki-events';

describe('stripHtml', () => {
  it('removes inline markup and decodes entities', () => {
    expect(stripHtml('<p>A <a href="x">coup</a> &amp; unrest</p>')).toBe('A coup & unrest');
  });
});

describe('mapWikiNews', () => {
  it('extracts the story text and its linked articles', () => {
    const [e] = mapWikiNews([{
      story: 'An attempted <a href="x">coup</a> in Niger occurs.',
      links: [{ titles: { normalized: 'Niger' }, content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Niger' } } }],
    }], '2026-09-01');
    expect(e.text).toBe('An attempted coup in Niger occurs.');
    expect(e.links[0]).toEqual({ title: 'Niger', url: 'https://en.wikipedia.org/wiki/Niger' });
  });

  it('skips empty stories and survives a null payload', () => {
    expect(mapWikiNews([{ story: '' }], '2026-09-01')).toHaveLength(0);
    expect(mapWikiNews(null, '2026-09-01')).toEqual([]);
  });
});
