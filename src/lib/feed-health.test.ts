import { describe, it, expect, beforeEach } from 'vitest';
import { recordSuccess, recordFailure, feedHealthSnapshot, clearFeedHealth } from './feed-health';
import { cachedSource, clearSourceCache } from './sourceCache';

beforeEach(() => { clearFeedHealth(); clearSourceCache(); });

describe('feed-health registry', () => {
  it('tracks success with count', () => {
    recordSuccess('safecast', 17);
    const [f] = feedHealthSnapshot();
    expect(f).toMatchObject({ key: 'safecast', ok: true, count: 17, servingStale: false });
    expect(f.lastSuccess).toBeTypeOf('number');
  });

  it('a failure after a success keeps the last good count and flags stale', () => {
    recordSuccess('gvp', 26);
    recordFailure('gvp', 'HTTP 403', true);
    const [f] = feedHealthSnapshot();
    expect(f.ok).toBe(false);
    expect(f.servingStale).toBe(true);
    expect(f.count).toBe(26);
    expect(f.lastErrorMsg).toBe('HTTP 403');
  });

  it('sorts hard failures first, then stale, then healthy', () => {
    recordSuccess('healthy', 5);
    recordFailure('stale', 'timeout', true);
    recordFailure('dead', 'DNS', false);
    expect(feedHealthSnapshot().map(f => f.key)).toEqual(['dead', 'stale', 'healthy']);
  });
});

describe('cachedSource integration', () => {
  it('records a success on a fresh fetch', async () => {
    await cachedSource('src-a', async () => [1, 2, 3])();
    expect(feedHealthSnapshot()[0]).toMatchObject({ key: 'src-a', ok: true, count: 3 });
  });

  it('records a stale-serving failure when the refresh throws over a cache', async () => {
    let fail = false;
    const fetcher = cachedSource('src-b', async () => {
      if (fail) throw new Error('upstream down');
      return [1, 2];
    }, 0); // ttl 0 — second call always refreshes
    await fetcher();
    fail = true;
    const served = await fetcher();
    expect(served).toEqual([1, 2]); // stale fallback still serves
    const [f] = feedHealthSnapshot();
    expect(f).toMatchObject({ ok: false, servingStale: true, lastErrorMsg: 'upstream down' });
  });

  it('records a hard failure when there is no cache to fall back on', async () => {
    await cachedSource('src-c', async () => { throw new Error('ECONNREFUSED'); })();
    expect(feedHealthSnapshot()[0]).toMatchObject({ ok: false, servingStale: false });
  });
});
