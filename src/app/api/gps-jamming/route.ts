import { NextResponse } from 'next/server';
import { cellToBoundary } from 'h3-js';
import { httpText } from '@/lib/httpJson';
import { parseJammingCsv, jammingUrl, type JammingCell } from '@/lib/gps-jamming';

/**
 * VANTAGE — GPS/GNSS interference (gpsjam.org, keyless).
 *
 * H3 cells are decoded to polygons server-side so h3-js never reaches the
 * client bundle.
 */

interface Cached { at: number; data: unknown }
let cache: Cached | null = null;
const TTL_MS = 60 * 60 * 1000;

function toFeature(c: JammingCell) {
  // cellToBoundary(..., true) yields [lng, lat] pairs, GeoJSON's order.
  const ring = cellToBoundary(c.h3, true);
  if (ring.length && (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1])) {
    ring.push(ring[0]);
  }
  return {
    type: 'Feature' as const,
    geometry: { type: 'Polygon' as const, coordinates: [ring] },
    properties: { h3: c.h3, good: c.good, bad: c.bad, ratio: c.ratio, level: c.level, color: c.color },
  };
}

async function fetchDay(d: Date): Promise<JammingCell[]> {
  const csv = await httpText(jammingUrl(d), {
    timeoutMs: 25000,
    headers: { Accept: 'text/csv' },
  });
  return parseJammingCsv(csv);
}

export async function GET() {
  if (cache && Date.now() - cache.at < TTL_MS) {
    return NextResponse.json({ ...(cache.data as object), cached: true });
  }

  try {
    // Today's file appears partway through the UTC day, so fall back a day.
    let cells = await fetchDay(new Date()).catch(() => [] as JammingCell[]);
    let day = 'today';
    if (cells.length === 0) {
      cells = await fetchDay(new Date(Date.now() - 86400_000));
      day = 'yesterday';
    }

    const payload = {
      cells: { type: 'FeatureCollection' as const, features: cells.slice(0, 3000).map(toFeature) },
      total: cells.length,
      day,
      source: 'gpsjam.org (John Wiseman)',
      timestamp: new Date().toISOString(),
    };
    cache = { at: Date.now(), data: payload };
    return NextResponse.json(payload);
  } catch (error) {
    console.error('[VANTAGE] GPS jamming fetch failed:', error);
    return NextResponse.json({ cells: { type: 'FeatureCollection', features: [] }, total: 0, error: 'GPS interference data unavailable' }, { status: 502 });
  }
}
