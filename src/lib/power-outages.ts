/**
 * VANTAGE — US power outages (DOE/ORNL ODIN, county level).
 *
 * ODIN aggregates utility reports into county records. "metersaffected" is the
 * customer count; a record with none is a resolved or placeholder entry.
 */

export interface PowerOutage {
  id: string;
  utility: string;
  county: string;
  state: string;
  lat: number;
  lng: number;
  customers: number;
  cause: string;
  status: string;
  started: string;
  restoration: string;
  color: string;
  source: string;
}

export interface OdinRecord {
  utilitydisclaimer?: string;
  name?: string;
  county?: string;
  state?: string;
  metersaffected?: number;
  cause?: string;
  incident_cause?: string;
  statuskind?: string;
  reportedstarttime?: string;
  estimatedrestorationtime?: string;
  utility_id?: string;
  geo_point_2d?: { lon?: number; lat?: number } | null;
}

/** Bands by customers affected — a county-wide outage reads very differently
 *  from a handful of meters on one feeder. */
export function outageColor(customers: number): string {
  if (customers >= 10000) return '#D32F2F';
  if (customers >= 1000) return '#FF9500';
  if (customers >= 100) return '#FFD700';
  return '#4FC3F7';
}

export function mapOdin(records: OdinRecord[] | null | undefined): PowerOutage[] {
  if (!Array.isArray(records)) return [];
  const out: PowerOutage[] = [];

  records.forEach((r, i) => {
    const lat = r?.geo_point_2d?.lat;
    const lng = r?.geo_point_2d?.lon;
    if (typeof lat !== 'number' || typeof lng !== 'number') return;

    const customers = typeof r.metersaffected === 'number' ? r.metersaffected : 0;
    if (customers <= 0) return; // resolved or placeholder rows carry no outage

    out.push({
      id: `odin-${r.utility_id ?? 'u'}-${i}`,
      // `utilitydisclaimer` holds boilerplate ("Data is preliminary..."), not a
      // name; `name` is "UTILITY,<id>" so the id suffix is trimmed off.
      utility: (r.name || '').replace(/,\s*\d+\s*$/, '').trim() || 'Unknown utility',
      county: r.county || '',
      state: r.state || '',
      lat,
      lng,
      customers,
      cause: r.cause || r.incident_cause || 'Unknown',
      status: r.statuskind || '',
      started: r.reportedstarttime || '',
      restoration: r.estimatedrestorationtime || '',
      color: outageColor(customers),
      source: 'DOE ODIN',
    });
  });

  return out.sort((a, b) => b.customers - a.customers);
}
