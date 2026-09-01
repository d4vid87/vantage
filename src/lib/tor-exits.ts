/**
 * VANTAGE — Tor exit-node distribution (Onionoo).
 *
 * Onionoo no longer publishes per-relay coordinates, only a country code, so
 * relays are aggregated to a per-country count and drawn on the centroid. That
 * is also the honest resolution: a relay's country is public, its street is not.
 */

import { centroidFor } from './countryCentroids';

export interface TorCountry {
  country: string;
  country_name: string;
  lat: number;
  lng: number;
  relays: number;
  bandwidth: number;
  color: string;
  source: string;
}

export interface Relay {
  country?: string;
  country_name?: string;
  observed_bandwidth?: number;
  running?: boolean;
}

export function aggregateExits(relays: Relay[] | null | undefined): TorCountry[] {
  if (!Array.isArray(relays)) return [];
  const byCountry = new Map<string, { n: number; bw: number; name: string }>();

  for (const r of relays) {
    const code = r?.country?.toUpperCase();
    if (!code) continue;
    const prev = byCountry.get(code) ?? { n: 0, bw: 0, name: r.country_name || code };
    prev.n += 1;
    prev.bw += typeof r.observed_bandwidth === 'number' ? r.observed_bandwidth : 0;
    byCountry.set(code, prev);
  }

  const out: TorCountry[] = [];
  for (const [code, v] of byCountry) {
    const c = centroidFor(code);
    if (!c) continue;
    out.push({
      country: code,
      country_name: v.name,
      lng: c[0],
      lat: c[1],
      relays: v.n,
      bandwidth: v.bw,
      color: '#7E57C2',
      source: 'Tor Project (Onionoo)',
    });
  }

  return out.sort((a, b) => b.relays - a.relays);
}
