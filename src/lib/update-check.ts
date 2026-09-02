/**
 * ═══════════════════════════════════════════════════════════════
 *  VANTAGE — update check
 *
 *  Compares the running version against package.json on the repo's main
 *  branch, once a day, in memory. A newer version shows as a badge in the
 *  HUD — nothing phones home beyond one GitHub raw fetch, and
 *  VANTAGE_UPDATE_CHECK=off silences even that.
 * ═══════════════════════════════════════════════════════════════
 */

const REMOTE_PKG = 'https://raw.githubusercontent.com/d4vid87/vantage/main/package.json';
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

export interface UpdateInfo {
  current: string;
  latest: string | null;
  available: boolean;
}

/** Numeric dotted compare; non-numeric parts compare as 0. Pure for tests. */
export function isNewer(latest: string, current: string): boolean {
  const parse = (v: string) => v.replace(/^v/, '').split('.').map((p) => parseInt(p, 10) || 0);
  const [a, b] = [parse(latest), parse(current)];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return false;
}

export function updateCheckEnabled(): boolean {
  return (process.env.VANTAGE_UPDATE_CHECK || 'on').trim().toLowerCase() !== 'off';
}

let cached: { info: UpdateInfo; at: number } | null = null;

export async function checkForUpdate(current: string): Promise<UpdateInfo> {
  const off: UpdateInfo = { current, latest: null, available: false };
  if (!updateCheckEnabled()) return off;
  if (cached && Date.now() - cached.at < CHECK_INTERVAL_MS) return cached.info;

  try {
    const res = await fetch(REMOTE_PKG, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return cached?.info ?? off;
    const pkg = (await res.json()) as { version?: string };
    const latest = typeof pkg.version === 'string' ? pkg.version : null;
    const info: UpdateInfo = { current, latest, available: latest !== null && isNewer(latest, current) };
    cached = { info, at: Date.now() };
    return info;
  } catch {
    return cached?.info ?? off; // offline boxes just never see the badge
  }
}

/** Test seam. */
export function resetUpdateCache(): void {
  cached = null;
}
