import { NextResponse } from 'next/server';
import { httpJson } from '@/lib/httpJson';
import { normalizeFrontlines, type FrontlineCollection } from '@/lib/frontlines';

/**
 * VANTAGE — Ukraine frontline control (DeepStateMap).
 */

let cache: { at: number; data: FrontlineCollection } | null = null;
const TTL_MS = 30 * 60 * 1000;

export async function GET() {
  if (cache && Date.now() - cache.at < TTL_MS) {
    return NextResponse.json({ frontlines: cache.data, cached: true, timestamp: new Date().toISOString() });
  }

  try {
    const raw = await httpJson<unknown>('https://deepstatemap.live/api/history/last', { timeoutMs: 15000 });
    const data = normalizeFrontlines(raw);
    cache = { at: Date.now(), data };
    return NextResponse.json({
      frontlines: data,
      total: data.features.length,
      source: 'DeepStateMap',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[VANTAGE] frontlines fetch failed:', error);
    // Stale beats blank on a map layer showing territorial control.
    if (cache) return NextResponse.json({ frontlines: cache.data, stale: true });
    return NextResponse.json({ frontlines: null, error: 'DeepState unavailable' }, { status: 502 });
  }
}
