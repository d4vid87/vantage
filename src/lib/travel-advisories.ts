/**
 * VANTAGE — US State Department travel advisories.
 *
 * The feed's `Category` field carries FIPS/GEC codes ("UP" for Ukraine, "IZ"
 * for Iraq), not ISO 3166, so the country is resolved from the headline —
 * "Ukraine - Level 4: Do Not Travel" — which is unambiguous.
 */

import { isoForName } from './countryNames';

export interface Advisory {
  iso: string;
  country: string;
  level: number;
  label: string;
  color: string;
  url: string;
  updated: string;
  source: string;
}

/** State Department's own four-step scale. */
export const LEVEL_LABELS: Record<number, string> = {
  1: 'Exercise Normal Precautions',
  2: 'Exercise Increased Caution',
  3: 'Reconsider Travel',
  4: 'Do Not Travel',
};

const LEVEL_COLORS: Record<number, string> = {
  1: '#00E676',
  2: '#FFD700',
  3: '#FF9500',
  4: '#D32F2F',
};

export function levelColor(level: number): string {
  return LEVEL_COLORS[level] ?? '#78909C';
}

/** "Ukraine - Level 4: Do Not Travel" → { country: 'Ukraine', level: 4 } */
export function parseTitle(title: string): { country: string; level: number } | null {
  const m = /^(.*?)\s+[-–]\s+Level\s+(\d)/i.exec(title.trim());
  if (!m) return null;
  return { country: m[1].trim(), level: Number(m[2]) };
}

interface AdvisoryItem {
  Title?: string;
  Link?: string;
  Updated?: string;
  Published?: string;
}

export function mapAdvisories(items: AdvisoryItem[] | null | undefined): Advisory[] {
  if (!Array.isArray(items)) return [];
  const byIso = new Map<string, Advisory>();

  for (const it of items) {
    const parsed = parseTitle(it?.Title ?? '');
    if (!parsed) continue;
    const iso = isoForName(parsed.country);
    if (!iso) continue;

    const prev = byIso.get(iso);
    // The feed carries regional sub-advisories too; the highest level for a
    // country is the one that should colour it.
    if (prev && prev.level >= parsed.level) continue;

    byIso.set(iso, {
      iso,
      country: parsed.country,
      level: parsed.level,
      label: LEVEL_LABELS[parsed.level] ?? '',
      color: levelColor(parsed.level),
      url: it.Link || '',
      updated: it.Updated || it.Published || '',
      source: 'US State Department',
    });
  }

  return [...byIso.values()].sort((a, b) => b.level - a.level);
}
