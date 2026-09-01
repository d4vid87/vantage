import { NextResponse } from 'next/server';
import { httpJson } from '@/lib/httpJson';
import { cachedSource } from '@/lib/sourceCache';
import { mapAdvisories, type Advisory } from '@/lib/travel-advisories';

/**
 * VANTAGE — US State Department travel advisories (keyless).
 */

const load = cachedSource<Advisory>('travel-advisories', async () => {
  const raw = await httpJson<unknown[]>('https://cadataapi.state.gov/api/TravelAdvisories', { timeoutMs: 25000 });
  return mapAdvisories(raw as never);
}, 6 * 60 * 60 * 1000);

export async function GET() {
  try {
    const advisories = await load();
    return NextResponse.json({
      advisories,
      total: advisories.length,
      source: 'US Department of State',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[VANTAGE] travel advisory fetch failed:', error);
    return NextResponse.json({ advisories: [], total: 0, error: 'Advisory data unavailable' }, { status: 502 });
  }
}
