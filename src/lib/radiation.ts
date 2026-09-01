/**
 * VANTAGE — Safecast radiation readings.
 *
 * Safecast is a citizen-science network of Geiger counters (CC0 data). The API
 * ignores its own `order` parameter — every ordering returns the same 2019 page —
 * so recent readings have to be selected with `since` instead of a sort.
 */

export interface RadiationStation {
  id: string;
  name: string;
  lat: number;
  lng: number;
  reading: number;
  unit: string;
  usvh: number | null;
  level: string;
  color: string;
  captured_at: string;
  network: string;
}

export interface SafecastMeasurement {
  id?: number;
  value?: number | null;
  unit?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  captured_at?: string | null;
  location_name?: string | null;
  device_id?: number | null;
}

/**
 * Safecast's own conversion for the LND-7317 pancake tube used by the bGeigie,
 * the overwhelmingly dominant device in the dataset.
 */
export const CPM_PER_USVH = 334;

/** Dose bands in µSv/h. Normal background sits under ~0.3. */
export function classify(usvh: number): { level: string; color: string } {
  if (usvh >= 10) return { level: 'Severe', color: '#8B0000' };
  if (usvh >= 1) return { level: 'Elevated', color: '#FF1744' };
  if (usvh >= 0.3) return { level: 'Raised', color: '#FF9500' };
  if (usvh >= 0.1) return { level: 'Normal', color: '#FFD700' };
  return { level: 'Background', color: '#00E676' };
}

function toUsvh(value: number, unit: string): number | null {
  const u = unit.toLowerCase();
  if (u === 'usv' || u === 'usvh' || u === 'µsv') return value;
  if (u === 'cpm') return value / CPM_PER_USVH;
  return null;
}

/**
 * Collapse a raw measurement stream into one marker per location. A single
 * bGeigie drive logs thousands of points metres apart, so readings are bucketed
 * on a ~1km grid and the highest reading in each bucket wins — under-reporting a
 * hot spot is the more dangerous error.
 */
export function mapRadiation(raw: SafecastMeasurement[]): RadiationStation[] {
  const buckets = new Map<string, RadiationStation>();

  for (const m of raw) {
    const { latitude: lat, longitude: lng, value, unit } = m;
    if (typeof lat !== 'number' || typeof lng !== 'number') continue;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) continue;
    if (!unit) continue;

    const usvh = toUsvh(value, unit);
    if (usvh === null) continue; // drop 'status'/'celcius' rows — not a dose

    const key = `${lat.toFixed(2)}:${lng.toFixed(2)}`;
    const prev = buckets.get(key);
    if (prev && prev.usvh !== null && prev.usvh >= usvh) continue;

    const { level, color } = classify(usvh);
    buckets.set(key, {
      id: `safecast-${m.id ?? key}`,
      name: m.location_name || `Safecast ${m.device_id ?? 'sensor'}`,
      lat,
      lng,
      reading: value,
      unit,
      usvh: Number(usvh.toFixed(4)),
      level,
      color,
      captured_at: m.captured_at || '',
      network: 'Safecast',
    });
  }

  return [...buckets.values()].sort((a, b) => (b.usvh ?? 0) - (a.usvh ?? 0));
}
