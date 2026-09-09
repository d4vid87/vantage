import type { IntelligenceContext } from '../ai-engine';

const MAX_PER_LAYER = 25;
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

/**
 * Shape the scheduler's snapshot into the context the briefing prompt expects.
 *
 * The feed routes and the prompt serializer disagree on field names — feeds
 * emit lat/lng/place, the serializer reads latitude/longitude/location and
 * calls .toFixed on them — so the mapping is explicit rather than a cast.
 * Unmapped layers fold into `threats`, letting a new feed reach the model
 * without touching the prompt.
 */
export function toContext(snapshot: Record<string, unknown[]>): IntelligenceContext {
  const rows = (k: string) => (Array.isArray(snapshot[k]) ? snapshot[k].filter(isRecord).slice(0, MAX_PER_LAYER) : []);
  const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  const str = (v: unknown): string => (v == null ? '' : String(v));

  const earthquakes = rows('earthquakes').map((r) => {
    const q = r as Record<string, unknown>;
    return {
      id: str(q.id),
      magnitude: num(q.magnitude),
      location: str(q.place ?? q.location),
      latitude: num(q.lat ?? q.latitude),
      longitude: num(q.lng ?? q.longitude),
      depth: num(q.depth),
      timestamp: str(q.time ?? q.timestamp),
      tsunami: Boolean(q.tsunami),
      felt: typeof q.felt === 'number' ? q.felt : null,
      alert: q.alert ? str(q.alert) : null,
    };
  });

  const news = rows('news').map((r) => {
    const n = r as Record<string, unknown>;
    const c = n.coords;
    return {
      id: str(n.id),
      title: str(n.title),
      description: str(n.description),
      link: str(n.link),
      published: str(n.published),
      source: str(n.source),
      risk_score: num(n.risk_score),
      coords: Array.isArray(c) && c.length >= 2 ? ([num(c[0]), num(c[1])] as [number, number]) : null,
      machine_assessment: n.machine_assessment ? str(n.machine_assessment) : null,
    };
  });

  const cyberAlerts = rows('cyber').map((r) => {
    const c = r as Record<string, unknown>;
    return {
      id: str(c.id), name: str(c.name), vendor: str(c.vendor), product: str(c.product),
      severity: str(c.severity), date: str(c.date), due: str(c.due), source: str(c.source),
    };
  });

  const known = new Set(['earthquakes', 'news', 'cyber']);
  const threats = Object.entries(snapshot)
    .filter(([k]) => !known.has(k))
    .flatMap(([layer, records]) =>
      (Array.isArray(records) ? records.filter(isRecord).slice(0, MAX_PER_LAYER) : []).map((r) => {
        const t = r as Record<string, unknown>;
        return {
          id: str(t.id ?? t.icao24 ?? t.mmsi),
          type: str(t.type ?? layer),
          title: str(t.title ?? t.name ?? t.callsign ?? t.icao24 ?? t.mmsi ?? t.victim ?? t.utility ?? t.disease ?? t.description),
          description: str(t.description ?? t.summary ?? t.notes ?? ''),
          severity: (str(t.severity).toUpperCase() || 'LOW') as 'CRITICAL' | 'HIGH' | 'ELEVATED' | 'LOW',
          region: str(t.country ?? t.country_name ?? t.state ?? t.location ?? ''),
          latitude: num(t.lat ?? t.latitude),
          longitude: num(t.lng ?? t.longitude),
          timestamp: str(t.date ?? t.published ?? t.started ?? t.discovered ?? ''),
          source: str(t.source ?? layer),
        };
      }),
    );

  return { earthquakes, news, threats, cyberAlerts, timestamp: new Date().toISOString() };
}

/** Accept both existing API context and raw map records at the shared boundary. */
export function normalizeContext(value: unknown): IntelligenceContext {
  const data = isRecord(value) ? value : {};
  const ctx = toContext({
    earthquakes: Array.isArray(data.earthquakes) ? data.earthquakes : [],
    news: Array.isArray(data.news) ? data.news : [],
    threats: Array.isArray(data.threats) ? data.threats : [],
    cyber: Array.isArray(data.cyberAlerts) ? data.cyberAlerts : [],
  });
  if (typeof data.timestamp === 'string') ctx.timestamp = data.timestamp.slice(0, 100);
  if (typeof data.scope === 'string') ctx.scope = data.scope.slice(0, 4000);
  return ctx;
}

export interface Bounds { west: number; south: number; east: number; north: number }
export function inBounds(lat: number, lng: number, box: Bounds): boolean {
  if (lat < box.south || lat > box.north) return false;
  if (box.east - box.west >= 360) return true;
  const wrap = (v: number) => ((v + 180) % 360 + 360) % 360 - 180;
  const west = wrap(box.west), east = wrap(box.east), x = wrap(lng);
  return west <= east ? x >= west && x <= east : x >= west || x <= east;
}

const MAP_KEYS: Record<string, string[]> = {
  flights: ['commercial_flights'], military: ['military_flights'], private: ['private_flights'], jets: ['private_jets'],
  maritime: ['maritime_ships'], earthquakes: ['earthquakes'], global_incidents: ['news', 'gdelt'],
  weather: ['weather_events'], live_news: ['news'], cf_outages: ['cf_outages'],
  malware: ['malware_threats'],
};

/** Restrict geographically located records to the operator's actual viewport. */
export function mapContext(data: Record<string, unknown>, active: Record<string, boolean>, bounds: Bounds | null, updated: Record<string, number> = {}): IntelligenceContext {
  const snapshot: Record<string, unknown[]> = {};
  const scope: string[] = [];
  for (const [layer, on] of Object.entries(active)) {
    if (!on) continue;
    for (const key of MAP_KEYS[layer] ?? [layer]) {
      if (snapshot[key]) continue;
      const records = Array.isArray(data[key]) ? data[key].filter(isRecord) : [];
      const visible = records.filter(r => {
        const lat = r.lat ?? r.latitude ?? (Array.isArray(r.coords) ? r.coords[0] : undefined);
        const lng = r.lng ?? r.lon ?? r.longitude ?? (Array.isArray(r.coords) ? r.coords[1] : undefined);
        return !bounds || (typeof lat === 'number' && typeof lng === 'number' && inBounds(lat, lng, bounds));
      });
      snapshot[key] = visible;
      scope.push(`${layer}: ${visible.length} visible, at most ${MAX_PER_LAYER} supplied; received ${updated[key] ? new Date(updated[key]).toISOString() : 'unknown'}`);
    }
  }
  const ctx = toContext(snapshot);
  ctx.scope = `${bounds ? 'Located records in the current viewport only.' : 'Viewport unavailable; active layers only.'} ${scope.join('; ')}`;
  return ctx;
}
