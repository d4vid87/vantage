import { NextResponse } from 'next/server';
import { httpJson } from '@/lib/httpJson';
import { cachedSource } from '@/lib/sourceCache';
import { mapOdin, type PowerOutage, type OdinRecord } from '@/lib/power-outages';

/**
 * VANTAGE — US power outages (DOE / Oak Ridge ODIN, keyless).
 */

const load = cachedSource<PowerOutage>('power-outages', async () => {
  // The county geometry is large and unused — only the centroid is needed.
  const url = 'https://ornl.opendatasoft.com/api/explore/v2.1/catalog/datasets/'
    + 'odin-real-time-outages-county/records?limit=100&order_by=metersaffected%20DESC'
    + '&select=utilitydisclaimer,name,county,state,metersaffected,cause,incident_cause,'
    + 'statuskind,reportedstarttime,estimatedrestorationtime,utility_id,geo_point_2d';
  const raw = await httpJson<{ results?: OdinRecord[] }>(url, { timeoutMs: 20000 });
  return mapOdin(raw?.results ?? []);
}, 5 * 60 * 1000);

export async function GET() {
  try {
    const outages = await load();
    return NextResponse.json({
      outages,
      total: outages.length,
      customers_affected: outages.reduce((n, o) => n + o.customers, 0),
      source: 'DOE ODIN (Oak Ridge National Laboratory)',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[VANTAGE] power outage fetch failed:', error);
    return NextResponse.json({ outages: [], total: 0, error: 'Power outage data unavailable' }, { status: 502 });
  }
}
