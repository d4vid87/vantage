import { symbolOf, validatePlace } from '../dashboard/types';
import { polygonGeometry } from '../dashboard/geometry';
import { ALL_CHANNELS, type Channel, type WatchKind, type WatchSpec } from './types';

/** The scheduled sources and their numeric fields. Shared with the watch form. */
export const WATCH_FIELDS: Record<string, readonly string[]> = {
  earthquakes: ['magnitude', 'depth'], flights: ['alt', 'speed_knots'], maritime: ['speed'],
  fires: ['brightness', 'frp'], conflicts: [], disease: [], volcanoes: [],
  power_outages: ['customers'], radiation: ['usvh'], air_quality: ['pm25', 'aqi'],
  internet_outages: [], ransomware: [], acled: ['fatalities'],
};
export interface RuleInput { name: string; kind: WatchKind; spec: WatchSpec; channels: Channel[]; webhookUrl?: string }
export const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const supported = (v: unknown): v is string => typeof v === 'string' && Object.hasOwn(WATCH_FIELDS, v);

export function validateRule(value: unknown): RuleInput {
  if (!record(value)) throw new Error('A watch object is required.');
  if (typeof value.name !== 'string' || !value.name.trim() || value.name.length > 120) throw new Error('Watch name must contain 1–120 characters.');
  const spec = value.spec;
  if (!record(spec)) throw new Error('A watch spec is required.');
  let clean: WatchSpec;
  switch (value.kind) {
    case 'market': {
      if (!['price', 'changePercent'].includes(String(spec.field)) || !['above', 'below'].includes(String(spec.comparator)) || !finite(spec.threshold) || (spec.field === 'price' && spec.threshold <= 0)) throw new Error('Choose a valid market threshold.');
      clean = { symbol: symbolOf(spec.symbol), field: spec.field as 'price' | 'changePercent', comparator: spec.comparator as 'above' | 'below', threshold: spec.threshold }; break;
    }
    case 'weather': {
      if (!!spec.place === !!spec.ring || !Array.isArray(spec.events) || !spec.events.length || spec.events.length > 100 || !spec.events.every(x => typeof x === 'string' && x.length > 0 && x.length <= 120)) throw new Error('Choose one place or area and weather event types.');
      if (spec.ring && (!Array.isArray(spec.ring) || spec.ring.length > 1000 || !polygonGeometry({ type: 'Polygon', coordinates: [spec.ring] }))) throw new Error('Invalid weather area.');
      clean = { ...(spec.place ? { place: validatePlace(spec.place) } : { ring: spec.ring as number[][] }), events: [...new Set(spec.events as string[])] }; break;
    }
    case 'entity':
      if (spec.entityType !== 'flight' && spec.entityType !== 'vessel') throw new Error('Scheduled entity watches support aircraft and vessels only.');
      if (typeof spec.identifier !== 'string' || !spec.identifier.trim() || spec.identifier.length > 200) throw new Error('Enter an identifier (up to 200 characters).');
      clean = { entityType: spec.entityType, identifier: spec.identifier.trim() };
      break;
    case 'threshold': {
      if (!supported(spec.layer) || typeof spec.field !== 'string' || !WATCH_FIELDS[spec.layer].includes(spec.field)) throw new Error('Choose a supported layer and numeric field.');
      if (!finite(spec.min)) throw new Error('Threshold must be a finite number.');
      clean = { layer: spec.layer, field: spec.field, min: spec.min };
      if (spec.bbox !== undefined) {
        const b = spec.bbox;
        if (!record(b) || !finite(b.west) || !finite(b.east) || !finite(b.south) || !finite(b.north) || Math.abs(b.west) > 180 || Math.abs(b.east) > 180 || Math.abs(b.south) > 90 || Math.abs(b.north) > 90 || b.south > b.north) throw new Error('Invalid bounding box.');
        clean.bbox = { west: b.west, east: b.east, south: b.south, north: b.north };
      }
      break;
    }
    case 'aoi': {
      if (!Array.isArray(spec.layers) || !spec.layers.length || !spec.layers.every(supported)) throw new Error('Choose supported geofence layers.');
      const ring = spec.ring;
      if (!Array.isArray(ring) || ring.length < 4 || ring.length > 1000 || !ring.every(p => Array.isArray(p) && p.length === 2 && finite(p[0]) && finite(p[1]) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90)) throw new Error('Draw a valid polygon (3–999 vertices).');
      if (ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1] || new Set(ring.map(p => p.join(','))).size < 3) throw new Error('Polygon must be closed with three distinct vertices.');
      const area = ring.slice(1).reduce((sum, p, i) => sum + ring[i][0] * p[1] - p[0] * ring[i][1], 0);
      if (Math.abs(area) < 1e-12) throw new Error('Polygon must enclose an area.');
      clean = { layers: [...new Set(spec.layers)], ring: ring.map(p => [...p]) };
      break;
    }
    default: throw new Error('Choose entity, threshold, geofence, market, or weather.');
  }
  const channels = value.channels ?? [];
  if (!Array.isArray(channels) || !channels.every(c => ALL_CHANNELS.includes(c))) throw new Error('Invalid notification channels.');
  let webhookUrl: string | undefined;
  if (value.webhookUrl !== undefined && value.webhookUrl !== '') {
    if (typeof value.webhookUrl !== 'string' || value.webhookUrl.length > 2048) throw new Error('Invalid webhook URL.');
    const url = new URL(value.webhookUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Webhook must be an HTTP(S) URL without embedded credentials.');
    webhookUrl = url.toString();
  }
  return { name: value.name.trim(), kind: value.kind as WatchKind, spec: clean, channels: [...new Set(channels)], webhookUrl };
}
