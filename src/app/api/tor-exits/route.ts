import { NextResponse } from 'next/server';
import { httpJson } from '@/lib/httpJson';
import { cachedSource } from '@/lib/sourceCache';
import { aggregateExits, type TorCountry, type Relay } from '@/lib/tor-exits';

/**
 * VANTAGE — Tor exit nodes by country (Onionoo, keyless).
 */

const load = cachedSource<TorCountry>('tor-exits', async () => {
  const raw = await httpJson<{ relays?: Relay[] }>(
    'https://onionoo.torproject.org/details?flag=Exit&running=true&fields=country,country_name,observed_bandwidth',
    { timeoutMs: 25000 },
  );
  return aggregateExits(raw?.relays ?? []);
}, 60 * 60 * 1000);

export async function GET() {
  try {
    const countries = await load();
    return NextResponse.json({
      countries,
      total: countries.length,
      relays: countries.reduce((n, c) => n + c.relays, 0),
      source: 'Tor Project (Onionoo)',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[VANTAGE] tor exit fetch failed:', error);
    return NextResponse.json({ countries: [], total: 0, error: 'Tor relay data unavailable' }, { status: 502 });
  }
}
