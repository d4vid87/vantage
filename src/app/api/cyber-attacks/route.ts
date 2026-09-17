import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Feodo reports observed command-and-control endpoints, not attacks or attacker
// origins. Country centroids are used only to place those indicators on a map.
const COUNTRY_COORDS: Record<string, [number, number]> = {
  AF:[65,33],AL:[20,41],DZ:[3,28],AO:[18.5,-12.5],AR:[-64,-34],AM:[45,40],AU:[134,-25],AT:[14,47.5],AZ:[50,40.5],
  BD:[90,24],BY:[28,53],BE:[4,50.8],BR:[-51,-10],BG:[25.5,42.7],CA:[-96,62],CL:[-71,-30],CN:[105,35],CO:[-72,4],
  CZ:[15.5,49.8],DE:[10,51],ES:[-4,40],FI:[26,64],FR:[2,46],GB:[-2,54],HK:[114.2,22.3],ID:[120,-5],IE:[-8,53],
  IL:[34.8,31.5],IN:[79,22],IR:[53,32],IT:[12.5,42.8],JP:[138,36],KR:[128,36],MX:[-102,23.5],MY:[112,3],
  NG:[8,10],NL:[5.5,52.5],NO:[8,62],NZ:[174,-41],PH:[122,12.5],PL:[19.5,52],RO:[25,46],RU:[100,60],
  SG:[103.8,1.35],TH:[101,15],TR:[35,39],TW:[121,23.7],UA:[32,49],US:[-97,38],VN:[106,16],ZA:[24,-29],
};

type FeodoEntry = { ip_address?: string; port?: number; dst_port?: number; country?: string; malware?: string; status?: string; first_seen?: string; last_online?: string };

export function mapFeodoEntries(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  return (raw as FeodoEntry[]).flatMap((entry, index) => {
    const point = entry.country ? COUNTRY_COORDS[entry.country] : undefined;
    if (!point || !entry.ip_address) return [];
    return [{
      id: `feodo-${entry.ip_address}-${entry.port ?? entry.dst_port ?? ''}-${index}`,
      lat: point[1], lng: point[0], location_precision: 'country-centroid',
      indicator_type: 'command-and-control endpoint', target_ip: entry.ip_address,
      target_country: entry.country, port: entry.port ?? entry.dst_port ?? null,
      malware: entry.malware || 'Unknown', status: entry.status || 'unknown',
      first_seen: entry.first_seen || null, observed_at: entry.last_online || entry.first_seen || null,
      source: 'abuse.ch Feodo Tracker', source_url: 'https://feodotracker.abuse.ch/',
    }];
  });
}

let cached: { attacks: ReturnType<typeof mapFeodoEntries>; retrieved_at: string } | null = null;
let cachedAt = 0;

export async function GET() {
  const now = Date.now();
  if (cached && now - cachedAt < 60_000) return NextResponse.json({ ...cached, total: cached.attacks.length, availability: 'current' });
  try {
    const res = await fetch('https://feodotracker.abuse.ch/downloads/ipblocklist.json', {
      signal: AbortSignal.timeout(10_000), cache: 'no-store', headers: { 'User-Agent': 'VANTAGE/4.3', Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`Feodo returned ${res.status}`);
    const attacks = mapFeodoEntries(await res.json());
    cached = { attacks, retrieved_at: new Date(now).toISOString() };
    cachedAt = now;
    return NextResponse.json({ ...cached, total: attacks.length, availability: 'current' });
  } catch (error) {
    if (cached) return NextResponse.json({ ...cached, total: cached.attacks.length, availability: 'stale', error: String(error) });
    return NextResponse.json({ attacks: [], total: 0, retrieved_at: new Date(now).toISOString(), availability: 'unavailable', error: String(error) }, { status: 502 });
  }
}
