import { freshTime } from '../dashboard/types';
import { inGeometry, intersectsGeometry, polygonGeometry } from '../dashboard/geometry';
import type { MarketSpec, WeatherSpec } from './types';
/**
 * ═══════════════════════════════════════════════════════════════
 *  VANTAGE — Watch-rule evaluator
 *
 *  Pure matching logic, deliberately kept free of I/O so it is directly
 *  testable: feed it a rule and a slice of live layer data, get back the
 *  records that should raise an alert.
 * ═══════════════════════════════════════════════════════════════
 */

import { inBounds } from '../ai/context';
import { pointInPolygon } from '../aoi';
import type { AoiSpec, EntitySpec, ThresholdSpec, WatchRule } from './types';

/** A generic record out of any layer feed. */
export type FeedRecord = Record<string, unknown>;

/** Layer name -> records. Mirrors the shape the HUD already holds in state. */
export type FeedSnapshot = Record<string, FeedRecord[]>;

export interface Match {
  /** Stable per-record key — the dedupe unit for edge-triggering. */
  key: string;
  layer: string;
  record: FeedRecord;
  lat: number | null;
  lng: number | null;
  label: string;
}

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? parseFloat(v) : (v as number);
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

/** Feeds are not uniform — probe the usual coordinate field names. */
export function coordsOf(rec: FeedRecord): { lat: number | null; lng: number | null } {
  const lat = num(rec.lat ?? rec.latitude ?? (Array.isArray(rec.coords) ? rec.coords[1] : undefined));
  const lng = num(rec.lng ?? rec.lon ?? rec.longitude ?? (Array.isArray(rec.coords) ? rec.coords[0] : undefined));
  return { lat, lng };
}

export function keyOf(layer: string, rec: FeedRecord): string {
  const id =
    rec.id ?? rec.icao24 ?? rec.mmsi ?? rec.hash ?? rec.link ?? rec.name ?? rec.title ?? JSON.stringify(rec);
  return `${layer}:${String(id)}`;
}

export function labelOf(rec: FeedRecord): string {
  return String(
    rec.title ?? rec.name ?? rec.location ?? rec.callsign ?? rec.id ?? 'unnamed entity'
  );
}

function matchAoi(spec: AoiSpec, snapshot: FeedSnapshot): Match[] {
  const out: Match[] = [];
  for (const layer of spec.layers) {
    for (const rec of snapshot[layer] ?? []) {
      const { lat, lng } = coordsOf(rec);
      if (lat == null || lng == null) continue;
      if (!pointInPolygon(lng, lat, spec.ring)) continue;
      out.push({ key: keyOf(layer, rec), layer, record: rec, lat, lng, label: labelOf(rec) });
    }
  }
  return out;
}

function matchEntity(spec: EntitySpec, snapshot: FeedSnapshot): Match[] {
  const needle = spec.identifier.trim().toLowerCase().replace(/^@/, '');
  if (!needle) return [];

  const out: Match[] = [];
  const layer = spec.entityType === 'flight' ? 'flights' : spec.entityType === 'vessel' ? 'maritime' : '';
  for (const rec of snapshot[layer] ?? []) {
      const identifiers = spec.entityType === 'flight' ? [rec.icao24, rec.callsign, rec.registration] : [rec.mmsi, rec.name];
      if (!identifiers.some(v => String(v ?? '').trim().toLowerCase() === needle)) continue;
      const { lat, lng } = coordsOf(rec);
      out.push({ key: keyOf(layer, rec), layer, record: rec, lat, lng, label: labelOf(rec) });
  }
  return out;
}

function matchThreshold(spec: ThresholdSpec, snapshot: FeedSnapshot): Match[] {
  const out: Match[] = [];
  for (const rec of snapshot[spec.layer] ?? []) {
    const value = num(rec[spec.field]);
    if (value == null || value < spec.min) continue;
    const { lat, lng } = coordsOf(rec);
    if (spec.bbox) {
      if (lat == null || lng == null) continue;
      if (!inBounds(lat, lng, spec.bbox)) continue;
    }
    out.push({ key: keyOf(spec.layer, rec), layer: spec.layer, record: rec, lat, lng, label: labelOf(rec) });
  }
  return out;
}

/** All records in `snapshot` that satisfy `rule`. Disabled rules match nothing. */
export function evaluateRule(rule: WatchRule, snapshot: FeedSnapshot): Match[] {
  if (!rule.enabled || (rule.snoozedUntil && Date.parse(rule.snoozedUntil) > Date.now())) return [];
  switch (rule.kind) {
    case 'market': {
      const spec = rule.spec as MarketSpec;
      return (snapshot.personal_quotes ?? []).filter(rec => rec.symbol === spec.symbol && rec.marketOpen === true && freshTime(rec.receivedAt,120000) && freshTime(rec.sourceTime,600000) && typeof rec[spec.field] === 'number' && Number.isFinite(rec[spec.field]) && (spec.comparator === 'above' ? Number(rec[spec.field]) > spec.threshold : Number(rec[spec.field]) < spec.threshold)).map(record => ({ key: 'market:' + spec.symbol, layer: 'personal_quotes', record, lat: null, lng: null, label: `${spec.symbol} ${spec.field} ${spec.comparator} ${spec.threshold}` }));
    }
    case 'weather': {
      const spec = rule.spec as WeatherSpec;
      return (snapshot.weather_alerts ?? []).filter(rec => {
        if (Date.parse(String(rec.expires)) <= Date.now() || !Number.isFinite(Date.parse(String(rec.expires))) || !freshTime(rec.receivedAt,120000)) return false;
        const event = String(rec.event);
        if (!spec.events.some(x => x === event || (x === 'warnings' && /Warning$/.test(event)) || (x === 'watches' && /Watch$/.test(event)) || x === 'all')) return false;
        if (spec.place && Array.isArray(rec.placeIds) && rec.placeIds.includes(spec.place.id)) return true;
        const g = polygonGeometry(rec.geometry); if (!g) return false;
        return spec.place ? inGeometry(spec.place.lng, spec.place.lat, g) : !!spec.ring && intersectsGeometry(spec.ring, g);
      }).map(record => ({ key: String(record.revisionKey), layer: 'weather_alerts', record, lat: spec.place?.lat ?? null, lng: spec.place?.lng ?? null, label: String(record.title) }));
    }
    case 'aoi':
      return matchAoi(rule.spec as AoiSpec, snapshot);
    case 'entity':
      return matchEntity(rule.spec as EntitySpec, snapshot);
    case 'threshold':
      return matchThreshold(rule.spec as ThresholdSpec, snapshot);
    default:
      return [];
  }
}

/** Severity heuristic used when a rule does not carry one of its own. */
export function severityFor(match: Match): 'CRITICAL' | 'HIGH' | 'ELEVATED' | 'INFO' {
  const mag = num(match.record.magnitude);
  if (mag != null) {
    if (mag >= 7) return 'CRITICAL';
    if (mag >= 6) return 'HIGH';
    if (mag >= 5) return 'ELEVATED';
  }
  const sev = typeof match.record.severity === 'string' ? match.record.severity.toUpperCase() : null;
  if (sev === 'EXTREME') return 'CRITICAL';
  if (sev === 'SEVERE') return 'HIGH';
  if (sev === 'MODERATE') return 'ELEVATED';
  if (sev === 'CRITICAL' || sev === 'HIGH' || sev === 'ELEVATED') return sev;
  return 'INFO';
}
