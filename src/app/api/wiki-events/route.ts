import { NextResponse } from 'next/server';
import { httpJson } from '@/lib/httpJson';
import { mapWikiNews, type WikiEvent } from '@/lib/wiki-events';

/**
 * VANTAGE — Wikipedia current-events digest (Wikimedia feed API, keyless).
 */

let cache: { at: number; day: string; events: WikiEvent[] } | null = null;
const TTL_MS = 60 * 60 * 1000;

function feedUrl(d: Date): { url: string; day: string } {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return {
    url: `https://api.wikimedia.org/feed/v1/wikipedia/en/featured/${y}/${m}/${day}`,
    day: `${y}-${m}-${day}`,
  };
}

export async function GET() {
  if (cache && Date.now() - cache.at < TTL_MS) {
    return NextResponse.json({ events: cache.events, total: cache.events.length, day: cache.day, cached: true });
  }

  try {
    // The day's feed appears partway through UTC; fall back to yesterday.
    let { url, day } = feedUrl(new Date());
    let raw = await httpJson<{ news?: unknown[] }>(url, { timeoutMs: 15000 }).catch(() => null);
    if (!raw?.news?.length) {
      ({ url, day } = feedUrl(new Date(Date.now() - 86400_000)));
      raw = await httpJson<{ news?: unknown[] }>(url, { timeoutMs: 15000 });
    }

    const events = mapWikiNews((raw?.news ?? []) as never, day);
    cache = { at: Date.now(), day, events };
    return NextResponse.json({
      events,
      total: events.length,
      day,
      source: 'Wikipedia Current Events',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[VANTAGE] wiki events fetch failed:', error);
    return NextResponse.json({ events: [], total: 0, error: 'Wikipedia digest unavailable' }, { status: 502 });
  }
}
