import { NextResponse } from 'next/server';
import { httpJson } from '@/lib/httpJson';
import { cachedSource } from '@/lib/sourceCache';
import { mapVictims, type RansomwareVictim, type RawVictim } from '@/lib/ransomware';

/**
 * VANTAGE — Recent ransomware victims (ransomware.live, keyless).
 *
 * Entries are gang leak-site claims, not confirmed breaches.
 */

const load = cachedSource<RansomwareVictim>('ransomware', async () => {
  const raw = await httpJson<RawVictim[]>('https://api.ransomware.live/v2/recentvictims', { timeoutMs: 25000 });
  return mapVictims(Array.isArray(raw) ? raw : []);
}, 30 * 60 * 1000);

export async function GET() {
  try {
    const victims = await load();
    const groups = new Map<string, number>();
    for (const v of victims) groups.set(v.group, (groups.get(v.group) ?? 0) + 1);

    return NextResponse.json({
      victims,
      total: victims.length,
      top_groups: [...groups.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
        .map(([group, count]) => ({ group, count })),
      source: 'ransomware.live — gang leak-site claims, not confirmed breaches',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[VANTAGE] ransomware fetch failed:', error);
    return NextResponse.json({ victims: [], total: 0, error: 'Ransomware data unavailable' }, { status: 502 });
  }
}
