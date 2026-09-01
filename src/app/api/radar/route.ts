import { NextResponse } from 'next/server';
import { centroidFor } from '@/lib/countryCentroids';

export const dynamic = 'force-dynamic';

/**
 * VANTAGE — Internet Outage Detection (IODA, Georgia Tech). Keyless.
 * Feeds the same "Internet Disruptions" layer as Cloudflare Radar, which is
 * merged in on top when a token is configured.
 */

interface IodaEvent {
  location?: string;
  score?: number;
  severity?: string;
  start?: number;
  duration?: number;
  datasource?: string;
}

export function mapIodaEvents(events: IodaEvent[]): Record<string, unknown>[] {
  return events.flatMap((e, i) => {
    const code = e.location?.split('/')[1];
    const c = code ? centroidFor(code) : null;
    if (!code || !c) return [];
    // Jitter so several events on one country don't stack into a single dot.
    const jLng = (((i * 137.5) % 200) - 100) / 100 * 2;
    const jLat = (((i * 251.3) % 200) - 100) / 100 * 2;
    return [{
      id: `ioda-${code}-${i}`,
      lat: c[1] + jLat,
      lng: c[0] + jLng,
      country: code,
      code,
      score: e.score || 0,
      level: e.severity || 'unknown',
      from: e.start,
      until: e.start ? e.start + (e.duration || 0) : null,
      datasource: (e.datasource || '').replace(/_/g, ' '),
    }];
  });
}

export async function GET() {
  try {
    const now = Math.floor(Date.now() / 1000);
    const from = now - 86400;
    const url = `https://api.ioda.inetintel.cc.gatech.edu/v2/outages/events?from=${from}&until=${now}&entityType=country&limit=200`;

    const res = await fetch(url, {
      signal: AbortSignal.timeout(12000),
      cache: 'no-store',
      headers: { 'User-Agent': 'VANTAGE/4.2', Accept: 'application/json' },
    });

    if (!res.ok) {
      return NextResponse.json({ outages: [], total: 0, timestamp: new Date().toISOString(), source: 'IODA (offline)' });
    }

    const json = await res.json();
    const outages = mapIodaEvents(json.data || []);

    return NextResponse.json({
      outages,
      total: outages.length,
      timestamp: new Date().toISOString(),
      source: 'IODA — Georgia Tech Internet Outage Detection',
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    });
  } catch (error) {
    console.error('[VANTAGE] IODA fetch error:', error);
    return NextResponse.json({ outages: [], total: 0, error: 'IODA unavailable' }, { status: 500 });
  }
}
