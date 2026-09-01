import { NextResponse } from 'next/server';
import { httpJson } from '@/lib/httpJson';
import { cachedSource } from '@/lib/sourceCache';
import { AQ_CITIES } from '@/lib/aq-cities';
import { mapOpenMeteo, mapOpenAq, type AirQualityStation } from '@/lib/air-quality';

/**
 * VANTAGE — Air quality (PM2.5).
 *
 * Keyless by default via Open-Meteo over a fixed city grid. With OPENAQ_API_KEY
 * set, OpenAQ's real ground-station network is used instead.
 */

async function fromOpenMeteo(): Promise<AirQualityStation[]> {
  const lat = AQ_CITIES.map((c) => c.lat).join(',');
  const lng = AQ_CITIES.map((c) => c.lng).join(',');
  const raw = await httpJson<unknown[]>(
    `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lng}&current=pm2_5,us_aqi`,
    { timeoutMs: 20000 },
  );
  return mapOpenMeteo(raw as never, AQ_CITIES);
}

async function fromOpenAq(key: string): Promise<AirQualityStation[]> {
  const raw = await httpJson<never>(
    'https://api.openaq.org/v3/parameters/2/latest?limit=1000',
    { timeoutMs: 20000, headers: { 'X-API-Key': key } },
  );
  return mapOpenAq(raw);
}

const load = cachedSource<AirQualityStation>('air-quality', async () => {
  const key = process.env.OPENAQ_API_KEY;
  if (key) {
    try {
      const stations = await fromOpenAq(key);
      if (stations.length) return stations;
    } catch (e) {
      console.warn('[VANTAGE] OpenAQ failed, falling back to Open-Meteo:', e);
    }
  }
  return fromOpenMeteo();
}, 30 * 60 * 1000);

export async function GET() {
  try {
    const stations = await load();
    return NextResponse.json({
      stations,
      total: stations.length,
      source: stations[0]?.source ?? 'Open-Meteo',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[VANTAGE] air quality fetch failed:', error);
    return NextResponse.json({ stations: [], total: 0, error: 'Air quality data unavailable' }, { status: 502 });
  }
}
