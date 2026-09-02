/**
 * ═══════════════════════════════════════════════════════════════
 *  VANTAGE — command palette search
 *
 *  Pure scoring over a flat command list: layers, countries, cities, panels.
 *  All data is local (the country/city gazetteers already ship for other
 *  layers), so matching costs nothing and works offline.
 * ═══════════════════════════════════════════════════════════════
 */

import { canonicalCountries } from './countryNames';
import { centroidFor } from './countryCentroids';
import { AQ_CITIES } from './aq-cities';

export interface Command {
  id: string;
  kind: 'layer' | 'country' | 'city' | 'panel';
  label: string;
  hint: string;
  /** flyTo target for country/city; layer key or panel id otherwise. */
  action: { layer?: string; panel?: string; lat?: number; lng?: number; zoom?: number };
}

export function titleCase(s: string): string {
  return s.replace(/\b\w/g, c => c.toUpperCase());
}

export function buildGeoCommands(): Command[] {
  const out: Command[] = [];
  for (const { iso, name } of canonicalCountries()) {
    const c = centroidFor(iso);
    if (!c) continue;
    out.push({
      id: `country:${iso}`,
      kind: 'country',
      label: titleCase(name),
      hint: iso,
      action: { lat: c[0], lng: c[1], zoom: 5 },
    });
  }
  for (const city of AQ_CITIES) {
    out.push({
      id: `city:${city.name}:${city.country}`,
      kind: 'city',
      label: city.name,
      hint: city.country,
      action: { lat: city.lat, lng: city.lng, zoom: 9 },
    });
  }
  return out;
}

/**
 * Prefix beats word-boundary beats substring; ties break by shorter label
 * (so "Chad" outranks "Chad Basin Cameras" for "cha"), then kind priority —
 * a layer toggle is more likely the intent than a city.
 */
const KIND_RANK: Record<Command['kind'], number> = { layer: 0, panel: 1, country: 2, city: 3 };

export function searchCommands(commands: Command[], query: string, limit = 12): Command[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored: { c: Command; s: number }[] = [];
  for (const c of commands) {
    const label = c.label.toLowerCase();
    let s = 0;
    if (label.startsWith(q)) s = 3;
    else if (label.includes(` ${q}`)) s = 2;
    else if (label.includes(q)) s = 1;
    if (s) scored.push({ c, s });
  }
  return scored
    .sort((a, b) => b.s - a.s
      || a.c.label.length - b.c.label.length
      || KIND_RANK[a.c.kind] - KIND_RANK[b.c.kind]
      || a.c.label.localeCompare(b.c.label))
    .slice(0, limit)
    .map(x => x.c);
}
