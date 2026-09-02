/**
 * ═══════════════════════════════════════════════════════════════
 *  VANTAGE — feed health registry
 *
 *  Every upstream fetch that goes through cachedSource() reports here, so a
 *  feed that dies upstream shows up as a red row instead of a quietly empty
 *  map layer. In-memory only: history resets on restart, which is fine — the
 *  question this answers is "is it broken NOW, and since when".
 * ═══════════════════════════════════════════════════════════════
 */

export interface FeedHealth {
  key: string;
  ok: boolean;              // last attempt succeeded with data
  count: number;            // items from the last successful fetch
  lastSuccess: number | null;
  lastError: number | null;
  lastErrorMsg: string | null;
  servingStale: boolean;    // failing now but still serving a cached copy
}

const registry = new Map<string, FeedHealth>();

function entry(key: string): FeedHealth {
  let e = registry.get(key);
  if (!e) {
    e = { key, ok: false, count: 0, lastSuccess: null, lastError: null, lastErrorMsg: null, servingStale: false };
    registry.set(key, e);
  }
  return e;
}

export function recordSuccess(key: string, count: number): void {
  const e = entry(key);
  e.ok = true;
  e.count = count;
  e.lastSuccess = Date.now();
  e.servingStale = false;
}

export function recordFailure(key: string, msg: string, servingStale: boolean): void {
  const e = entry(key);
  e.ok = false;
  e.lastError = Date.now();
  e.lastErrorMsg = msg.slice(0, 200);
  e.servingStale = servingStale;
}

/** Failing feeds first, then stale, then healthy — the panel shows worst on top. */
export function feedHealthSnapshot(): FeedHealth[] {
  const rank = (e: FeedHealth) => (e.ok ? 2 : e.servingStale ? 1 : 0);
  return [...registry.values()].sort((a, b) => rank(a) - rank(b) || a.key.localeCompare(b.key));
}

/** Test seam. */
export function clearFeedHealth(): void {
  registry.clear();
}
