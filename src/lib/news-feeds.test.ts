import { describe, it, expect } from 'vitest';
import { BUILTIN_FEEDS, RSS_FEEDS, TELEGRAM_CHANNELS } from './news-feeds';

describe('BUILTIN_FEEDS', () => {
  it('is the union of the two lists that used to diverge', () => {
    // /api/live-news had 16 entries and LiveAlerts had a different 24, while a
    // comment claimed they were synced.
    expect(BUILTIN_FEEDS.length).toBeGreaterThanOrEqual(25);
    for (const name of ['Euronews', 'TRT World', 'teleSUR EN', 'Sky News', 'RT News']) {
      expect(BUILTIN_FEEDS.some((f) => f.name === name)).toBe(true);
    }
  });

  it('has unique ids and complete coordinates', () => {
    expect(new Set(BUILTIN_FEEDS.map((f) => f.id)).size).toBe(BUILTIN_FEEDS.length);
    for (const f of BUILTIN_FEEDS) {
      expect(Math.abs(f.lat)).toBeLessThanOrEqual(90);
      expect(Math.abs(f.lng)).toBeLessThanOrEqual(180);
      expect(typeof f.embed_allowed).toBe('boolean');
    }
  });
});

describe('RSS_FEEDS', () => {
  it('spans all three tiers', () => {
    for (const tier of ['wire', 'regional', 'osint']) {
      expect(RSS_FEEDS.some((f) => f.tier === tier)).toBe(true);
    }
  });

  it('has no duplicate urls', () => {
    expect(new Set(RSS_FEEDS.map((f) => f.url)).size).toBe(RSS_FEEDS.length);
  });

  it('is a real expansion on the three feeds this replaced', () => {
    expect(RSS_FEEDS.length).toBeGreaterThanOrEqual(30);
  });

  it('still carries the Telegram OSINT channels', () => {
    expect(TELEGRAM_CHANNELS).toContain('OSINTtechnical');
  });
});
