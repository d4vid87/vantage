/**
 * ═══════════════════════════════════════════════════════════════
 *  VANTAGE — RECON authorization gate
 *
 *  The RECON toolkit sends live traffic at third-party infrastructure. In a
 *  defensive deployment that is only appropriate against assets you own or
 *  are contracted to test, so it ships OFF and every use is written to an
 *  audit trail the operator can produce on request.
 *
 *  Enable with VANTAGE_RECON_ENABLED=1 after reading AUTHORIZED_USE.md.
 * ═══════════════════════════════════════════════════════════════
 */

import { db, newId } from './db';

export function reconEnabled(): boolean {
  const v = (process.env.VANTAGE_RECON_ENABLED || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

export const RECON_DISABLED_BODY = {
  error:
    'RECON toolkit is disabled. Active scanning may only be run against infrastructure you own or are explicitly authorized to test. Read AUTHORIZED_USE.md, then set VANTAGE_RECON_ENABLED=1 to enable it.',
  code: 'RECON_DISABLED',
} as const;

/**
 * Append a RECON action to the audit trail. Best-effort: an audit write
 * failure must not take the scan down, but it is logged loudly.
 */
export function auditRecon(entry: {
  tool: string;
  target: string;
  actorIp?: string | null;
  outcome: string;
}): void {
  try {
    db()
      .prepare(
        'INSERT INTO recon_audit (id, tool, target, actor_ip, outcome, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(
        newId('audit'),
        entry.tool,
        entry.target.slice(0, 500),
        entry.actorIp ?? null,
        entry.outcome,
        new Date().toISOString()
      );
  } catch (err) {
    console.error('[VANTAGE] RECON audit write failed:', err);
  }
}

export interface AuditRecord {
  id: string;
  tool: string;
  target: string;
  actorIp: string | null;
  outcome: string;
  createdAt: string;
}

export function listAudit(limit = 200): AuditRecord[] {
  const rows = db()
    .prepare('SELECT * FROM recon_audit ORDER BY created_at DESC LIMIT ?')
    .all(limit) as Array<{
    id: string;
    tool: string;
    target: string;
    actor_ip: string | null;
    outcome: string;
    created_at: string;
  }>;
  return rows.map((r) => ({
    id: r.id,
    tool: r.tool,
    target: r.target,
    actorIp: r.actor_ip,
    outcome: r.outcome,
    createdAt: r.created_at,
  }));
}
