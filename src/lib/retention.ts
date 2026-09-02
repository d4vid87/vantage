/**
 * ═══════════════════════════════════════════════════════════════
 *  VANTAGE — data retention
 *
 *  The SQLite file grows without bound otherwise: every fired alert, brief
 *  and audit row stays forever. One daily prune keeps a self-hosted box from
 *  quietly eating its disk. Rules and investigations are operator-authored
 *  and never touched — retention is for machine-generated history only.
 * ═══════════════════════════════════════════════════════════════
 */

import { db } from './db';

const DAY_MS = 86_400_000;

export const DEFAULT_RETENTION_DAYS = 90;
/** Audit trail is kept longer — it is the accountability record. */
export const AUDIT_RETENTION_DAYS = 180;
/** Watch-state dedup keys: safe to forget once nothing has re-seen them. */
export const WATCH_STATE_RETENTION_DAYS = 30;

export interface PruneResult {
  alerts: number;
  briefs: number;
  reconAudit: number;
  watchState: number;
}

export function retentionDays(): number {
  const raw = Number(process.env.VANTAGE_RETENTION_DAYS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_RETENTION_DAYS;
}

/** All created_at/seen_at columns are ISO strings — lexicographic compare works. */
export function pruneOldData(now = Date.now(), days = retentionDays()): PruneResult {
  const iso = (d: number) => new Date(now - d * DAY_MS).toISOString();
  const run = (sql: string, cutoff: string) => db().prepare(sql).run(cutoff).changes;

  return {
    alerts: run('DELETE FROM alerts WHERE created_at < ?', iso(days)),
    briefs: run('DELETE FROM briefs WHERE created_at < ?', iso(days)),
    reconAudit: run('DELETE FROM recon_audit WHERE created_at < ?', iso(Math.max(days, AUDIT_RETENTION_DAYS))),
    watchState: run('DELETE FROM watch_state WHERE seen_at < ?', iso(WATCH_STATE_RETENTION_DAYS)),
  };
}
