/**
 * VANTAGE — air quality.
 *
 * OpenAQ v2 (which this layer originally used) now answers 410 Gone, and v3
 * requires a registered key. Open-Meteo's air-quality API is keyless, global,
 * and accepts batched coordinates, so the default layer samples a fixed list of
 * major population centres and works with no signup at all. Set OPENAQ_API_KEY
 * to trade that grid for OpenAQ's real ground-station network.
 */

export interface AirQualityStation {
  id: string;
  name: string;
  city: string;
  country: string;
  lat: number;
  lng: number;
  pm25: number;
  aqi: number | null;
  unit: string;
  level: string;
  color: string;
  source: string;
  lastUpdated: string;
}

/** US EPA PM2.5 breakpoints (µg/m³). */
export function classifyPm25(v: number): { level: string; color: string } {
  if (v > 250) return { level: 'Hazardous', color: '#8B0000' };
  if (v > 150) return { level: 'Very Unhealthy', color: '#8E24AA' };
  if (v > 55) return { level: 'Unhealthy', color: '#FF1744' };
  if (v > 35) return { level: 'Unhealthy (Sensitive)', color: '#FF9500' };
  if (v > 12) return { level: 'Moderate', color: '#FFD700' };
  return { level: 'Good', color: '#00E676' };
}

interface OpenMeteoResult {
  latitude?: number;
  longitude?: number;
  current?: { time?: string; pm2_5?: number | null; us_aqi?: number | null };
}

export function mapOpenMeteo(
  results: OpenMeteoResult[] | null | undefined,
  cities: { name: string; country: string; lat: number; lng: number }[],
): AirQualityStation[] {
  if (!Array.isArray(results)) return [];
  const out: AirQualityStation[] = [];

  results.forEach((r, i) => {
    const city = cities[i];
    if (!city) return;
    const pm25 = r?.current?.pm2_5;
    if (typeof pm25 !== 'number' || !Number.isFinite(pm25)) return;

    const { level, color } = classifyPm25(pm25);
    out.push({
      id: `aq-${city.name.toLowerCase().replace(/\s+/g, '-')}`,
      name: city.name,
      city: city.name,
      country: city.country,
      // Trust our own gazetteer over the grid cell the API snapped to.
      lat: city.lat,
      lng: city.lng,
      pm25: Number(pm25.toFixed(1)),
      aqi: typeof r.current?.us_aqi === 'number' ? Math.round(r.current.us_aqi) : null,
      unit: 'µg/m³',
      level,
      color,
      source: 'Open-Meteo',
      lastUpdated: r.current?.time ?? '',
    });
  });

  return out.sort((a, b) => b.pm25 - a.pm25);
}

interface OpenAqLatest {
  results?: {
    coordinates?: { latitude?: number; longitude?: number };
    value?: number;
    datetime?: { utc?: string };
    location?: string;
    locationsId?: number;
    country?: { code?: string };
  }[];
}

export function mapOpenAq(raw: OpenAqLatest | null | undefined): AirQualityStation[] {
  const rows = raw?.results;
  if (!Array.isArray(rows)) return [];
  const out: AirQualityStation[] = [];

  for (const r of rows) {
    const lat = r?.coordinates?.latitude;
    const lng = r?.coordinates?.longitude;
    const v = r?.value;
    if (typeof lat !== 'number' || typeof lng !== 'number') continue;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) continue;

    const { level, color } = classifyPm25(v);
    out.push({
      id: `aq-oaq-${r.locationsId ?? `${lat},${lng}`}`,
      name: r.location || 'Monitoring station',
      city: r.location || 'Unknown',
      country: r.country?.code || '',
      lat,
      lng,
      pm25: Number(v.toFixed(1)),
      aqi: null,
      unit: 'µg/m³',
      level,
      color,
      source: 'OpenAQ',
      lastUpdated: r.datetime?.utc ?? '',
    });
  }

  return out.sort((a, b) => b.pm25 - a.pm25);
}
