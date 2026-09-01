import { NextResponse } from 'next/server';
import { httpJson } from '@/lib/httpJson';
import { cachedSource } from '@/lib/sourceCache';
import { mapAcled, type ConflictEvent } from '@/lib/acled';

/**
 * VANTAGE — ACLED conflict events. Requires ACLED_API_KEY + ACLED_EMAIL
 * (free registration). Hidden in the UI when unconfigured.
 */

function credentials(): { key: string; email: string } | null {
  const key = process.env.ACLED_API_KEY;
  const email = process.env.ACLED_EMAIL;
  return key && email ? { key, email } : null;
}

const load = cachedSource<ConflictEvent>('acled', async () => {
  const c = credentials();
  if (!c) return [];
  const since = new Date(Date.now() - 14 * 86400_000).toISOString().slice(0, 10);
  const url = `https://api.acleddata.com/acled/read?key=${encodeURIComponent(c.key)}`
    + `&email=${encodeURIComponent(c.email)}&event_date=${since}&event_date_where=%3E%3D`
    + '&limit=1000&format=json';
  const raw = await httpJson<{ data?: unknown[] }>(url, { timeoutMs: 30000 });
  return mapAcled((raw?.data ?? []) as never);
}, 30 * 60 * 1000);

export async function GET(req: Request) {
  const configured = !!credentials();

  // Capability probe — lets the UI hide the layer without fetching data.
  if (new URL(req.url).searchParams.get('probe') === '1') {
    return NextResponse.json({ configured });
  }

  if (!configured) {
    return NextResponse.json(
      { configured: false, events: [], error: 'ACLED_API_KEY and ACLED_EMAIL are not set' },
      { status: 503 },
    );
  }

  try {
    const events = await load();
    return NextResponse.json({
      configured: true,
      events,
      total: events.length,
      source: 'ACLED (acleddata.com) — attribution required',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[VANTAGE] ACLED fetch failed:', error);
    return NextResponse.json({ configured: true, events: [], error: 'ACLED unavailable' }, { status: 502 });
  }
}
