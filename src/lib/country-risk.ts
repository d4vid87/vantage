/**
 * VANTAGE — country instability index.
 *
 * A single number nobody can audit is worth very little, so the score is the
 * sum of named components and every one of them is returned alongside it. The
 * static baseline is an editorial judgement; everything else is measured from
 * the live feeds this instance is already pulling.
 */

export interface RiskComponents {
  base: number;
  advisory: number;
  outages: number;
  ransomware: number;
  conflict: number;
  seismic: number;
}

export interface CountryRisk {
  code: string;
  score: number;
  level: 'CRITICAL' | 'HIGH' | 'ELEVATED' | 'MODERATE' | 'LOW';
  components: RiskComponents;
  tags: string[];
  color: string;
}

export const RISK_LEVELS: Array<{ min: number; level: CountryRisk['level']; color: string }> = [
  { min: 80, level: 'CRITICAL', color: '#D32F2F' },
  { min: 65, level: 'HIGH', color: '#FF5252' },
  { min: 45, level: 'ELEVATED', color: '#FF9500' },
  { min: 25, level: 'MODERATE', color: '#FFD700' },
  { min: 0, level: 'LOW', color: '#00E676' },
];

export function levelFor(score: number): { level: CountryRisk['level']; color: string } {
  for (const l of RISK_LEVELS) if (score >= l.min) return { level: l.level, color: l.color };
  return { level: 'LOW', color: '#00E676' };
}

/**
 * A State Department level is a considered judgement by people with sources we
 * do not have, so it carries real weight — but it is capped so an advisory
 * alone cannot manufacture a crisis.
 */
export function advisoryPoints(level: number | undefined): number {
  if (!level) return 0;
  return { 1: 0, 2: 4, 3: 10, 4: 18 }[level] ?? 0;
}

/** Diminishing returns: the tenth outage says far less than the first. */
function scaled(count: number, perUnit: number, cap: number): number {
  if (count <= 0) return 0;
  return Math.min(cap, Math.round(perUnit * Math.log2(count + 1) * 10) / 10);
}

export interface RiskInputs {
  base: Record<string, { base: number; tags: string[] }>;
  advisories: Record<string, number>;
  outages: Record<string, number>;
  ransomware: Record<string, number>;
  conflicts: Record<string, number>;
  seismic: Record<string, number>;
}

export function scoreCountries(inputs: RiskInputs): CountryRisk[] {
  const codes = new Set<string>([
    ...Object.keys(inputs.base),
    ...Object.keys(inputs.advisories),
    ...Object.keys(inputs.outages),
    ...Object.keys(inputs.ransomware),
    ...Object.keys(inputs.conflicts),
    ...Object.keys(inputs.seismic),
  ]);

  const out: CountryRisk[] = [];
  for (const code of codes) {
    const baseEntry = inputs.base[code];
    const components: RiskComponents = {
      base: baseEntry?.base ?? 0,
      advisory: advisoryPoints(inputs.advisories[code]),
      // Connectivity loss is a strong instability tell — shutdowns accompany unrest.
      outages: scaled(inputs.outages[code] ?? 0, 4, 12),
      ransomware: scaled(inputs.ransomware[code] ?? 0, 1.5, 6),
      conflict: scaled(inputs.conflicts[code] ?? 0, 3, 15),
      seismic: scaled(inputs.seismic[code] ?? 0, 3, 10),
    };

    const raw = Object.values(components).reduce((a, b) => a + b, 0);
    const score = Math.max(0, Math.min(100, Math.round(raw)));
    const { level, color } = levelFor(score);
    out.push({ code, score, level, components, tags: baseEntry?.tags ?? [], color });
  }

  return out.sort((a, b) => b.score - a.score);
}
