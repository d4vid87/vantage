/**
 * VANTAGE — upstream source cache.
 *
 * Camera *indexes* (where the cameras are) change on the order of weeks, while
 * the frames themselves are pulled live by the client straight from the source.
 * Re-downloading a 500 KB index on every request is pure waste — and some of
 * these upstreams are slow enough to dominate the response (MDOT ~7s, NZTA ~8s),
 * so an uncached `region=all` took ~15s every single time.
 *
 * Three behaviours matter here:
 *   • TTL        — serve from memory until the index is plausibly stale.
 *   • dedup      — concurrent misses share one upstream request instead of
 *                  stampeding it (a `region=all` fan-out hits every source at once).
 *   • stale-on-error — if the upstream fails, keep serving the last good index
 *                  rather than dropping the layer to zero cameras.
 */

import { recordSuccess, recordFailure } from './feed-health';

interface Entry<T> {
  data: T[];
  expiresAt: number;
  inflight: Promise<T[]> | null;
}

const store = new Map<string, Entry<unknown>>();

export const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Cap on distinct keys. Camera sources are a fixed handful, but callers with
 * per-coordinate keys (place lookups) would otherwise grow this map without
 * bound. Map preserves insertion order, so the oldest keys evict first.
 */
const MAX_ENTRIES = 500;

function evictIfNeeded(): void {
  if (store.size <= MAX_ENTRIES) return;
  for (const key of store.keys()) {
    if (store.size <= MAX_ENTRIES) break;
    const entry = store.get(key);
    if (entry?.inflight) continue; // never drop a request in progress
    store.delete(key);
  }
}

/**
 * Wrap a camera fetcher with TTL caching, in-flight dedup and stale fallback.
 * Returns a drop-in replacement with the same signature.
 */
export function cachedSource<T>(
  key: string,
  fetcher: () => Promise<T[]>,
  ttlMs: number = DEFAULT_TTL_MS,
  options: { emptyIsFailure?: boolean } = {},
): () => Promise<T[]> {
  return async () => {
    const now = Date.now();
    const entry = store.get(key) as Entry<T> | undefined;

    if (entry && now < entry.expiresAt) return entry.data;
    if (entry?.inflight) return entry.inflight;

    const inflight = (async () => {
      try {
        const data = await fetcher();
        // Catalogs should retain a last-known-good index when a provider
        // unexpectedly returns nothing. Event feeds can opt out: an empty
        // successful response means the events really have cleared.
        if (data.length === 0 && options.emptyIsFailure !== false && entry?.data.length) {
          recordFailure(key, 'empty response', true);
          store.set(key, { data: entry.data, expiresAt: now + ttlMs, inflight: null });
          return entry.data;
        }
        if (data.length === 0 && options.emptyIsFailure !== false) recordFailure(key, 'empty response', false);
        else recordSuccess(key, data.length);
        store.set(key, { data, expiresAt: now + ttlMs, inflight: null });
        return data;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (entry?.data.length) {
          console.warn(`[VANTAGE] ${key} refresh failed — serving ${entry.data.length} cached cameras`);
          recordFailure(key, msg, true);
          // Retry sooner than a full TTL, but don't hammer the failing upstream.
          store.set(key, { data: entry.data, expiresAt: now + 60_000, inflight: null });
          return entry.data;
        }
        console.warn(`[VANTAGE] ${key} fetch failed with no cache to fall back on:`, e);
        recordFailure(key, msg, false);
        store.set(key, { data: [], expiresAt: now + 60_000, inflight: null });
        return [];
      }
    })();

    store.set(key, {
      data: entry?.data ?? [],
      expiresAt: entry?.expiresAt ?? 0,
      inflight,
    } as Entry<unknown>);
    evictIfNeeded();

    return inflight;
  };
}

/** Test seam — drops all cached indexes. */
export function clearSourceCache(): void {
  store.clear();
}
