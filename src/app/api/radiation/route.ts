import { NextResponse } from 'next/server';
import { httpJson } from '@/lib/httpJson';
import { cachedSource } from '@/lib/sourceCache';
import { mapRadiation, type RadiationStation, type SafecastMeasurement } from '@/lib/radiation';

/**
 * VANTAGE — Radiation monitoring (Safecast, CC0, keyless).
 */

const WINDOW_HOURS = 48;

const load = cachedSource<RadiationStation>('radiation', async () => {
  const since = new Date(Date.now() - WINDOW_HOURS * 3600_000)
    .toISOString()
    .replace(/\.\d+Z$/, '');
  const raw = await httpJson<SafecastMeasurement[]>(
    `https://api.safecast.org/measurements.json?since=${encodeURIComponent(since)}&per_page=1000`,
    { timeoutMs: 20000 },
  );
  return mapRadiation(Array.isArray(raw) ? raw : []);
}, 30 * 60 * 1000);

export async function GET() {
  try {
    const stations = await load();
    return NextResponse.json({
      stations,
      total: stations.length,
      source: 'Safecast (CC0)',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[VANTAGE] radiation fetch failed:', error);
    return NextResponse.json({ stations: [], total: 0, error: 'Radiation data unavailable' }, { status: 502 });
  }
}
