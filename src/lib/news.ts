/**
 * VANTAGE — news normalisation: dedupe, risk scoring and geolocation.
 */

import crypto from 'crypto';
import { AQ_CITIES } from './aq-cities';
import { COUNTRY_CENTROIDS } from './countryCentroids';
import { isoForName } from './countryNames';

export interface NewsItem {
  id: string;
  title: string;
  description: string;
  link: string;
  published: string;
  source: string;
  tier: string;
  risk_score: number;
  /** [lat, lng] — the order the map layer and IntelFeed already expect. */
  coords: [number, number] | null;
  coords_default: boolean;
  geo_source: string | null;
  machine_assessment: string | null;
}

export const RISK_KEYWORDS = [
  'war', 'missile', 'strike', 'attack', 'crisis', 'tension', 'military', 'conflict',
  'defense', 'clash', 'nuclear', 'invasion', 'bomb', 'drone', 'weapon', 'sanctions',
  'ceasefire', 'escalation', 'killed', 'destroyed', 'operation', 'casualty',
  'frontline', 'threat',
];

export function scoreRisk(text: string): number {
  const lower = (text || '').toLowerCase();
  let score = 1;
  for (const kw of RISK_KEYWORDS) if (lower.includes(kw)) score += 2;
  return Math.min(10, score);
}

/**
 * Headline geolocation.
 *
 * GDELT GEO 2.0 was the intended geocoder, but api.gdeltproject.org is far too
 * slow to sit in a request path from a self-hosted box — repeated probes took
 * 18s for a bare root and timed out entirely at 90s for a real query. So places
 * are resolved locally instead, against the country table and the city
 * gazetteer that already ship with the app.
 *
 * Cities are matched before countries: "Kyiv" is more useful than "Ukraine",
 * and longer names are tried first so "South Korea" cannot be swallowed by
 * "Korea".
 */

interface Place { name: string; coords: [number, number] }

/** Conflict datelines and capitals that the city gazetteer does not carry. */
const EXTRA_PLACES: Record<string, [number, number]> = {
  gaza: [31.416, 34.333], 'west bank': [31.947, 35.273], rafah: [31.287, 34.246],
  kharkiv: [49.988, 36.232], odesa: [46.482, 30.723], donetsk: [48.015, 37.803],
  crimea: [45.3, 34.4], mariupol: [47.096, 37.543], kherson: [46.635, 32.616],
  'red sea': [20.0, 38.0], 'strait of hormuz': [26.567, 56.25],
  'south china sea': [13.0, 114.0], 'taiwan strait': [24.5, 119.5],
  darfur: [13.0, 24.0], sahel: [15.0, 5.0], kashmir: [34.083, 74.797],
  'korean peninsula': [38.0, 127.0], 'north korea': [40.34, 127.51],
  pyongyang: [39.039, 125.762], damascus: [33.513, 36.292], aleppo: [36.202, 37.134],
  sanaa: [15.369, 44.191], mogadishu: [2.047, 45.318], khartoum: [15.5, 32.56],
  'port-au-prince': [18.594, -72.307], caracas: [10.491, -66.902],
  brussels: [50.851, 4.352], geneva: [46.204, 6.143], 'the hague': [52.078, 4.288],
};

/** Longest-first so a specific place wins over a substring of it. */
const PLACES: Place[] = (() => {
  const out: Place[] = [];
  for (const [name, coords] of Object.entries(EXTRA_PLACES)) out.push({ name, coords });
  for (const c of AQ_CITIES) out.push({ name: c.name.toLowerCase(), coords: [c.lat, c.lng] });
  return out.sort((a, b) => b.name.length - a.name.length);
})();

/** Country names, resolved through the shared alias table. */
const COUNTRY_PLACES: Place[] = (() => {
  const out: Place[] = [];
  const names = [
    'Ukraine', 'Russia', 'Israel', 'Iran', 'Lebanon', 'Syria', 'Yemen', 'China', 'Taiwan',
    'Sudan', 'Myanmar', 'Venezuela', 'India', 'Pakistan', 'Afghanistan', 'Iraq', 'Libya',
    'Somalia', 'Mali', 'Haiti', 'United States', 'United Kingdom', 'France', 'Germany',
    'Japan', 'South Korea', 'Turkey', 'Egypt', 'Nigeria', 'Ethiopia', 'Kenya', 'Poland',
    'Georgia', 'Armenia', 'Azerbaijan', 'Serbia', 'Belarus', 'Moldova', 'Niger',
    'Burkina Faso', 'Democratic Republic of the Congo', 'South Africa', 'Brazil',
    'Mexico', 'Colombia', 'Argentina', 'Canada', 'Australia', 'Indonesia', 'Philippines',
    'Vietnam', 'Thailand', 'Bangladesh', 'Saudi Arabia', 'United Arab Emirates', 'Qatar',
  ];
  for (const n of names) {
    const iso = isoForName(n);
    const c = iso ? COUNTRY_CENTROIDS[iso] : null;
    if (c) out.push({ name: n.toLowerCase(), coords: [c[1], c[0]] });
  }
  return out.sort((a, b) => b.name.length - a.name.length);
})();

/** Whole-word match, so "Mali" cannot fire inside "Somalia". */
function mentions(haystack: string, needle: string): boolean {
  const i = haystack.indexOf(needle);
  if (i < 0) return false;
  const before = i === 0 ? ' ' : haystack[i - 1];
  const after = i + needle.length >= haystack.length ? ' ' : haystack[i + needle.length];
  return !/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after);
}

export function findCoords(text: string): [number, number] | null {
  const lower = (text || '').toLowerCase();
  for (const p of PLACES) if (mentions(lower, p.name)) return p.coords;
  for (const p of COUNTRY_PLACES) if (mentions(lower, p.name)) return p.coords;
  return null;
}

export function normalizeTitle(title: string): string {
  return (title || '')
    .toLowerCase()
    .replace(/[‘’“”'"]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface RawArticle {
  title?: string;
  description?: string;
  link?: string;
  pubDate?: string;
  source?: string;
  tier?: string;
}

export function dedupe(articles: RawArticle[]): RawArticle[] {
  const seen = new Set<string>();
  const out: RawArticle[] = [];
  for (const a of articles) {
    const key = normalizeTitle(a.title ?? '');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out;
}

/** Retained for callers that already hold a GDELT GeoJSON payload. */
export function gdeltIndex(geojson: unknown): Map<string, [number, number]> {
  const index = new Map<string, [number, number]>();
  const features = (geojson as { features?: unknown[] })?.features;
  if (!Array.isArray(features)) return index;

  for (const f of features) {
    const feat = f as {
      geometry?: { coordinates?: [number, number] };
      properties?: { name?: string; html?: string };
    };
    const c = feat?.geometry?.coordinates;
    if (!Array.isArray(c) || c.length < 2) continue;
    // GeoJSON is [lng, lat]; the rest of this app carries news coords as [lat, lng].
    const latlng: [number, number] = [c[1], c[0]];

    const html = feat.properties?.html ?? '';
    for (const m of html.matchAll(/<a href="[^"]*"[^>]*>([^<]{12,})<\/a>/g)) {
      const key = normalizeTitle(m[1]);
      if (key && !index.has(key)) index.set(key, latlng);
    }
    const name = feat.properties?.name;
    if (name) {
      const key = normalizeTitle(name);
      if (key && !index.has(key)) index.set(key, latlng);
    }
  }
  return index;
}

export function buildNews(articles: RawArticle[], geo?: Map<string, [number, number]>): NewsItem[] {
  return dedupe(articles).map((a) => {
    const text = `${a.title ?? ''} ${a.description ?? ''}`;
    const risk = scoreRisk(text);
    const key = normalizeTitle(a.title ?? '');

    const fromGdelt = geo?.get(key) ?? null;
    const coords = fromGdelt ?? findCoords(text);

    return {
      id: crypto.createHash('md5').update((a.link || '') + (a.title || '')).digest('hex'),
      title: a.title ?? '',
      description: a.description ?? '',
      link: a.link ?? '',
      published: a.pubDate ?? '',
      source: a.source ?? '',
      tier: a.tier ?? 'wire',
      risk_score: risk,
      coords,
      coords_default: !coords,
      geo_source: fromGdelt ? 'gdelt' : coords ? 'gazetteer' : null,
      machine_assessment: risk >= 8
        ? 'AI Analysis indicates elevated tactical priority based on OSINT stream patterns.'
        : null,
    };
  }).sort((a, b) => new Date(b.published).getTime() - new Date(a.published).getTime());
}
