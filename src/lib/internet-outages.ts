/**
 * VANTAGE — internet disruption fusion.
 *
 * Two independent detectors answer the same question. Cloudflare Radar carries
 * curated, human-described outage annotations but needs an API token; IODA
 * (Georgia Tech) infers outages from BGP withdrawals and background radiation
 * and is keyless. Merging them means the layer still works with no credentials,
 * and gains description quality when a token is present.
 */

export interface Outage {
  id: string;
  lat: number;
  lng: number;
  country: string;
  country_name: string;
  scope: string;
  event_type: string;
  cause: string;
  description: string;
  start: string;
  source: string;
}

interface IodaOutage {
  id?: string;
  lat?: number;
  lng?: number;
  country?: string;
  code?: string;
  score?: number;
  level?: string;
  from?: number;
  datasource?: string;
}

export function mapIodaOutages(raw: IodaOutage[] | null | undefined): Outage[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((o) => {
    if (typeof o?.lat !== 'number' || typeof o?.lng !== 'number') return [];
    const code = o.country || o.code || '';
    return [{
      id: o.id || `ioda-${code}`,
      lat: o.lat,
      lng: o.lng,
      country: code,
      country_name: code,
      scope: 'country',
      event_type: 'OUTAGE',
      cause: o.datasource ? `detected via ${o.datasource}` : '',
      description: `IODA detected a connectivity drop (score ${Math.round(o.score ?? 0)})`,
      start: o.from ? new Date(o.from * 1000).toISOString() : '',
      source: 'IODA',
    }];
  });
}

/**
 * Cloudflare wins a collision: its annotations are human-written and name a
 * cause, where IODA only reports that connectivity fell.
 */
export function mergeOutages(cloudflare: Outage[], ioda: Outage[]): Outage[] {
  const byCountry = new Map<string, Outage>();
  for (const o of ioda) if (o.country) byCountry.set(o.country, o);
  for (const o of cloudflare) if (o.country) byCountry.set(o.country, o);

  const unkeyed = [...cloudflare, ...ioda].filter((o) => !o.country);
  return [...byCountry.values(), ...unkeyed];
}
