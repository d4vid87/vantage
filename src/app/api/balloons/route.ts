import { NextResponse } from 'next/server';
import { httpJson } from '@/lib/httpJson';
import { cachedSource } from '@/lib/sourceCache';
import { mapBalloons, type Balloon, type SondeFrame } from '@/lib/balloons';

/**
 * VANTAGE — High-altitude balloons / radiosondes (SondeHub, keyless).
 */

const load = cachedSource<Balloon>('balloons', async () => {
  const raw = await httpJson<Record<string, SondeFrame>>(
    'https://api.v2.sondehub.org/sondes?last=7200',
    { timeoutMs: 15000 },
  );
  return mapBalloons(raw);
}, 5 * 60 * 1000);

export async function GET() {
  try {
    const balloons = await load();
    return NextResponse.json({
      balloons,
      total: balloons.length,
      source: 'SondeHub',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[VANTAGE] balloons fetch failed:', error);
    return NextResponse.json({ balloons: [], total: 0, error: 'Balloon data unavailable' }, { status: 502 });
  }
}
