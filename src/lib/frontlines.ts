/**
 * VANTAGE — DeepStateMap Ukraine frontline normalisation.
 *
 * DeepState publishes a Google-Earth export: ~526 features where most are unit
 * markers and attack arrows, with the styling smuggled into `styleUrl` and the
 * status appended to a trilingual `name`. Only the polygons describe territorial
 * control, so those are what the layer keeps.
 */

export interface FrontlineFeature {
  type: 'Feature';
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown };
  properties: { id: string; status: string; color: string; name: string };
}

export interface FrontlineCollection {
  type: 'FeatureCollection';
  features: FrontlineFeature[];
}

/** Fallbacks by status, used when the export carries no usable styleUrl. */
const STATUS_COLORS: Record<string, string> = {
  occupied: '#A52714',
  liberated: '#0F9D58',
  dismissed: '#0F9D58',
  dismissed_at: '#FFD700',
  unknown: '#BCAAA4',
};

export function statusOf(name: string): string {
  const m = /geoJSON\.status\.(\w+)/.exec(name || '');
  return m ? m[1] : 'unknown';
}

export function colorOf(styleUrl: string, status: string): string {
  const m = /^#(?:poly|line)-([0-9A-Fa-f]{6})/.exec(styleUrl || '');
  if (m) return `#${m[1].toUpperCase()}`;
  return STATUS_COLORS[status] ?? STATUS_COLORS.unknown;
}

/** Strip the altitude ordinate — every position is [lng, lat, 0] in the export. */
function flatten(coords: unknown): unknown {
  if (!Array.isArray(coords)) return coords;
  if (typeof coords[0] === 'number') return (coords as number[]).slice(0, 2);
  return coords.map(flatten);
}

export function normalizeFrontlines(raw: unknown): FrontlineCollection {
  const map = (raw as { map?: { features?: unknown[] } } | null)?.map;
  const features = Array.isArray(map?.features) ? map.features : [];
  const out: FrontlineFeature[] = [];

  for (const f of features) {
    const feat = f as {
      geometry?: { type?: string; coordinates?: unknown };
      properties?: { name?: string; styleUrl?: string };
    };
    const type = feat?.geometry?.type;
    if (type !== 'Polygon' && type !== 'MultiPolygon') continue;

    const name = feat.properties?.name ?? '';
    const status = statusOf(name);
    out.push({
      type: 'Feature',
      geometry: { type, coordinates: flatten(feat.geometry?.coordinates) },
      properties: {
        id: `dsm-${out.length}`,
        status,
        color: colorOf(feat.properties?.styleUrl ?? '', status),
        // The name is trilingual with the machine status appended; keep the
        // English middle segment, which is what an operator can actually read.
        name: (name.split('///')[1] ?? name.split('///')[0] ?? '').trim(),
      },
    });
  }

  return { type: 'FeatureCollection', features: out };
}
