import { it, expect } from 'vitest';
import { MAP_FEEDS, feedDue, feedInterval } from './map-feeds';
it('retries failures without hammering and refreshes successful feeds on expiry', () => {
  expect(feedDue({ key: 'x', error: 'offline', lastAttempt: 1000 }, 100000, 2000)).toBe(false);
  expect(feedDue({ key: 'x', error: 'offline', lastAttempt: 1000 }, 100000, 61000)).toBe(true);
  expect(feedDue({ key: 'x', lastSuccess: 1000 }, 100000, 101000)).toBe(true);
  expect(feedDue({ key: 'x', loading: true }, 100, 999999)).toBe(false);
  expect(feedInterval(MAP_FEEDS.find(f => f.key === 'maritime')!, true)).toBe(60000);
  expect(new Set(MAP_FEEDS.map(f => f.key)).size).toBe(MAP_FEEDS.length);
});
