/**
 * VANTAGE — ransomware victim tracking (ransomware.live).
 *
 * Victims are leak-site postings by the gangs themselves: a claim, not a
 * confirmed breach. Only the victim's country is known, so markers sit on
 * country centroids and are jittered apart.
 */

import { centroidFor } from './countryCentroids';

export interface RansomwareVictim {
  id: string;
  victim: string;
  group: string;
  country: string;
  sector: string;
  lat: number;
  lng: number;
  discovered: string;
  attackdate: string;
  url: string;
  color: string;
  source: string;
}

export interface RawVictim {
  victim?: string;
  group?: string;
  group_name?: string;
  country?: string;
  activity?: string;
  discovered?: string;
  attackdate?: string;
  post_url?: string;
  claim_url?: string;
}

export function mapVictims(raw: RawVictim[] | null | undefined, limit = 300): RansomwareVictim[] {
  if (!Array.isArray(raw)) return [];
  const out: RansomwareVictim[] = [];

  raw.slice(0, limit).forEach((v, i) => {
    const code = v?.country?.toUpperCase();
    const c = code ? centroidFor(code) : null;
    if (!c || !v.victim) return;

    // Many victims share a country; spread them so the markers stay countable.
    const angle = (i * 137.5 * Math.PI) / 180;
    const r = 0.6 + (i % 7) * 0.35;

    out.push({
      id: `rw-${(v.victim || '').slice(0, 40)}-${i}`,
      victim: v.victim,
      group: v.group || v.group_name || 'unknown',
      country: code as string,
      sector: v.activity || '',
      lng: c[0] + Math.cos(angle) * r,
      lat: c[1] + Math.sin(angle) * r,
      discovered: v.discovered || '',
      attackdate: v.attackdate || '',
      url: v.post_url || v.claim_url || '',
      color: '#E040FB',
      source: 'ransomware.live',
    });
  });

  return out;
}
