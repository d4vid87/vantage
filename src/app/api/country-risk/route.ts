import { NextResponse } from 'next/server';
import { isoForName } from '@/lib/countryNames';
import { scoreCountries, type RiskInputs } from '@/lib/country-risk';

/**
 * VANTAGE — country instability index.
 *
 * Blends an editorial baseline with live signals this instance already
 * collects: travel advisories, internet disruptions, ransomware claims,
 * conflict reporting and significant seismicity. Every component is returned
 * with the score so an analyst can see what drove it.
 */

const RISK_FACTORS: Record<string, { base: number; tags: string[] }> = {
  UA: { base: 85, tags: ['active_conflict', 'infrastructure_damage'] },
  RU: { base: 72, tags: ['sanctions', 'military_mobilization'] },
  IL: { base: 78, tags: ['active_conflict', 'regional_instability'] },
  PS: { base: 90, tags: ['active_conflict', 'humanitarian_crisis'] },
  SY: { base: 82, tags: ['post_conflict', 'infrastructure_damage'] },
  YE: { base: 88, tags: ['active_conflict', 'humanitarian_crisis'] },
  MM: { base: 76, tags: ['civil_unrest', 'military_junta'] },
  SD: { base: 84, tags: ['active_conflict', 'humanitarian_crisis'] },
  AF: { base: 80, tags: ['post_conflict', 'governance_collapse'] },
  KP: { base: 70, tags: ['nuclear_risk', 'isolation'] },
  IR: { base: 68, tags: ['sanctions', 'nuclear_program', 'regional_proxy'] },
  CN: { base: 35, tags: ['strategic_competition', 'taiwan_tensions'] },
  TW: { base: 45, tags: ['invasion_risk', 'semiconductor_dependency'] },
  VE: { base: 60, tags: ['economic_collapse', 'political_instability'] },
  HT: { base: 85, tags: ['gang_violence', 'governance_collapse'] },
  LB: { base: 65, tags: ['economic_crisis', 'political_deadlock'] },
  PK: { base: 55, tags: ['terrorism', 'political_instability'] },
  SO: { base: 82, tags: ['terrorism', 'state_fragility'] },
  LY: { base: 72, tags: ['divided_government', 'militia_control'] },
  ET: { base: 62, tags: ['ethnic_tensions', 'regional_conflicts'] },
};

// Major stock exchange status
const EXCHANGES = [
  { name: 'NYSE', tz: 'America/New_York', open: 9.5, close: 16, country: 'US' },
  { name: 'NASDAQ', tz: 'America/New_York', open: 9.5, close: 16, country: 'US' },
  { name: 'LSE', tz: 'Europe/London', open: 8, close: 16.5, country: 'GB' },
  { name: 'TSE', tz: 'Asia/Tokyo', open: 9, close: 15, country: 'JP' },
  { name: 'SSE', tz: 'Asia/Shanghai', open: 9.5, close: 15, country: 'CN' },
  { name: 'HKEX', tz: 'Asia/Hong_Kong', open: 9.5, close: 16, country: 'HK' },
  { name: 'BSE', tz: 'Asia/Kolkata', open: 9.25, close: 15.5, country: 'IN' },
  { name: 'FRA', tz: 'Europe/Berlin', open: 8, close: 20, country: 'DE' },
  { name: 'TSX', tz: 'America/Toronto', open: 9.5, close: 16, country: 'CA' },
  { name: 'ASX', tz: 'Australia/Sydney', open: 10, close: 16, country: 'AU' },
  { name: 'KRX', tz: 'Asia/Seoul', open: 9, close: 15.5, country: 'KR' },
  { name: 'MOEX', tz: 'Europe/Moscow', open: 10, close: 18.5, country: 'RU' },
];

function isExchangeOpen(ex: typeof EXCHANGES[0]): boolean {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: ex.tz, hour: 'numeric', minute: 'numeric', hour12: false, weekday: 'short',
    });
    const parts = formatter.formatToParts(now);
    const weekday = parts.find(p => p.type === 'weekday')?.value || '';
    if (['Sat', 'Sun'].includes(weekday)) return false;
    const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
    const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0');
    const decimal = hour + minute / 60;
    return decimal >= ex.open && decimal < ex.close;
  } catch { return false; }
}

function selfOrigin(): string {
  return process.env.VANTAGE_SELF_ORIGIN || `http://127.0.0.1:${process.env.PORT || 3000}`;
}

/**
 * A failed input degrades its component to zero rather than the whole index.
 * Plain fetch, not the shared https client — these are loopback http calls,
 * which that client cannot make.
 */
async function local<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${selfOrigin()}${path}`, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function tally(codes: (string | null | undefined)[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of codes) if (c) out[c] = (out[c] ?? 0) + 1;
  return out;
}

export async function GET() {
  try {
    const exchangeStatus = EXCHANGES.map((ex) => ({
      name: ex.name, country: ex.country, open: isExchangeOpen(ex),
    }));

    const [advisoryRes, outageRes, ransomRes, quakeRes, conflictRes] = await Promise.all([
      local<{ advisories?: { iso: string; level: number }[] }>('/api/travel-advisories'),
      local<{ outages?: { country?: string }[] }>('/api/radar'),
      local<{ victims?: { country?: string }[] }>('/api/ransomware'),
      local<{ earthquakes?: { place?: string; magnitude?: number }[] }>('/api/earthquakes'),
      local<{ zones?: { country?: string }[] }>('/api/conflicts'),
    ]);

    const advisories: Record<string, number> = {};
    for (const a of advisoryRes?.advisories ?? []) advisories[a.iso] = a.level;

    // USGS place strings end in a country or US state name. Resolving the tail
    // is why this no longer substring-matches ISO codes — that matched "UA"
    // inside "Guatemala".
    const seismic: Record<string, number> = {};
    for (const q of quakeRes?.earthquakes ?? []) {
      if ((q.magnitude ?? 0) < 4.5) continue;
      const tail = (q.place ?? '').split(',').pop()?.trim();
      const iso = isoForName(tail);
      if (iso) seismic[iso] = (seismic[iso] ?? 0) + 1;
    }

    const inputs: RiskInputs = {
      base: RISK_FACTORS,
      advisories,
      outages: tally((outageRes?.outages ?? []).map((o) => o.country)),
      ransomware: tally((ransomRes?.victims ?? []).map((v) => v.country)),
      conflicts: tally((conflictRes?.zones ?? []).map((z) => z.country)),
      seismic,
    };

    const countries = scoreCountries(inputs);

    return NextResponse.json({
      countries,
      // Retained for existing consumers that read the old field names.
      exchanges: exchangeStatus,
      open_exchanges: exchangeStatus.filter((e) => e.open).length,
      total_exchanges: exchangeStatus.length,
      inputs_available: {
        advisories: !!advisoryRes, outages: !!outageRes, ransomware: !!ransomRes,
        seismic: !!quakeRes, conflicts: !!conflictRes,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[VANTAGE] country risk failed:', err);
    return NextResponse.json({ countries: [], exchanges: [], error: 'Failed' }, { status: 500 });
  }
}
