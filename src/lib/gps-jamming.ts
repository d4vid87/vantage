/**
 * VANTAGE — GPS/GNSS interference (gpsjam.org).
 *
 * gpsjam publishes one gzipped CSV per day of H3 resolution-4 cells, each with
 * a count of aircraft in that cell reporting good vs degraded navigation
 * accuracy. The interference rate — not the raw count — is the signal.
 */

export interface JammingCell {
  h3: string;
  good: number;
  bad: number;
  ratio: number;
  level: string;
  color: string;
}

/** gpsjam's own banding: above 10% is notable, above 50% is severe. */
export function classifyRatio(ratio: number): { level: string; color: string } {
  if (ratio >= 0.5) return { level: 'Severe', color: '#D32F2F' };
  if (ratio >= 0.1) return { level: 'Moderate', color: '#FF9500' };
  return { level: 'Low', color: '#FFD700' };
}

/**
 * Cells with only a handful of aircraft produce meaningless ratios — one
 * aircraft with a bad fix is not a jamming event.
 */
export const MIN_AIRCRAFT = 5;

export function parseJammingCsv(csv: string): JammingCell[] {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return [];

  const header = lines[0].split(',').map((h) => h.trim());
  const iHex = header.indexOf('hex');
  const iGood = header.indexOf('count_good_aircraft');
  const iBad = header.indexOf('count_bad_aircraft');
  if (iHex < 0 || iGood < 0 || iBad < 0) return [];

  const out: JammingCell[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    const h3 = cols[iHex]?.trim();
    const good = Number(cols[iGood]);
    const bad = Number(cols[iBad]);
    if (!h3 || !Number.isFinite(good) || !Number.isFinite(bad)) continue;

    const total = good + bad;
    if (total < MIN_AIRCRAFT) continue;
    const ratio = bad / total;
    if (ratio <= 0) continue; // nothing to show where navigation is healthy

    const { level, color } = classifyRatio(ratio);
    out.push({ h3, good, bad, ratio: Number(ratio.toFixed(3)), level, color });
  }

  return out.sort((a, b) => b.ratio - a.ratio);
}

/** gpsjam publishes per UTC day; today's file may not exist yet. */
export function jammingUrl(d: Date): string {
  const iso = d.toISOString().slice(0, 10);
  return `https://gpsjam.org/data/${iso}-h3_4.csv`;
}
