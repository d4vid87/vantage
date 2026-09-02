import { NextResponse } from 'next/server';

export const maxDuration = 60;

/**
 * VANTAGE — Global Stats API
 * Lightweight aggregation endpoint: asks each heavy route for `?count=1`
 * (a ~20-byte body) instead of downloading multi-MB payloads to count them.
 * The full payloads exceed Next's 2MB fetch-cache limit, so counting the
 * old way re-fetched everything on every call.
 */

const SOURCES = [
  { key: 'flights',   path: '/api/flights',        revalidate: 45 },
  { key: 'sats',      path: '/api/satellites',     revalidate: 3600 },
  { key: 'cctv',      path: '/api/cctv',           revalidate: 3600 },
  { key: 'weather',   path: '/api/weather',        revalidate: 300 },
  { key: 'nuclear',   path: '/api/infrastructure', revalidate: 86400 },
  { key: 'incidents', path: '/api/gdelt',          revalidate: 300 },
] as const;

export async function GET(req: Request) {
  try {
    const origin = new URL(req.url).origin;

    const results = await Promise.allSettled(SOURCES.map(s =>
      fetch(`${origin}${s.path}?count=1`, {
        signal: AbortSignal.timeout(20000),
        next: { revalidate: s.revalidate },
      })
    ));

    const stats: Record<string, number> = {};
    for (let i = 0; i < SOURCES.length; i++) {
      const r = results[i];
      let count = 0;
      if (r.status === 'fulfilled' && r.value.ok) {
        try { count = (await r.value.json()).count || 0; } catch { /* keep 0 */ }
      }
      stats[SOURCES[i].key] = count;
    }

    return NextResponse.json({
      stats,
      timestamp: new Date().toISOString(),
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' },
    });
  } catch (error) {
    console.error('Stats aggregation failed:', error);
    return NextResponse.json({ error: 'Failed to compute stats' }, { status: 500 });
  }
}
