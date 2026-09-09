/** Watch-rule and alert persistence on top of the SQLite store. */

import { validateRule, type RuleInput } from './validation';
import { db, newId } from '../db';
import type { Alert, Channel, WatchKind, WatchRule, WatchSpec } from './types';

interface RuleRow {
  id: string;
  name: string;
  kind: string;
  spec: string;
  channels: string;
  enabled: number;
  created_at: string;
  last_fired_at: string | null;
  snoozed_until: string | null;
}

function toRule(row: RuleRow): WatchRule {
  // webhookUrl is stored inside the spec blob but is not part of the match
  // criteria, so lift it back out onto the rule.
  const stored = JSON.parse(row.spec) as Record<string, unknown>;
  const { webhookUrl, ...rest } = stored;
  return {
    id: row.id,
    name: row.name,
    kind: row.kind as WatchKind,
    spec: rest as unknown as WatchSpec,
    webhookUrl: typeof webhookUrl === 'string' ? webhookUrl : undefined,
    channels: JSON.parse(row.channels) as Channel[],
    enabled: row.enabled === 1,
    createdAt: row.created_at,
    lastFiredAt: row.last_fired_at,
    snoozedUntil: row.snoozed_until,
  };
}

export function listRules(): WatchRule[] {
  return (db().prepare('SELECT * FROM watch_rules ORDER BY created_at DESC').all() as RuleRow[]).map(
    toRule
  );
}

export function getRule(id: string): WatchRule | null {
  const row = db().prepare('SELECT * FROM watch_rules WHERE id = ?').get(id) as RuleRow | undefined;
  return row ? toRule(row) : null;
}

export function createRule(raw: RuleInput): WatchRule {
  const input = validateRule(raw);
  const id = newId('rule');
  const createdAt = new Date().toISOString();
  const spec = input.webhookUrl ? { ...input.spec, webhookUrl: input.webhookUrl } : input.spec;
  db()
    .prepare(
      `INSERT INTO watch_rules (id, name, kind, spec, channels, enabled, created_at)
       VALUES (?, ?, ?, ?, ?, 1, ?)`
    )
    .run(id, input.name, input.kind, JSON.stringify(spec), JSON.stringify(input.channels), createdAt);
  return getRule(id)!;
}

export function setRuleEnabled(id: string, enabled: boolean): void {
  db().prepare('UPDATE watch_rules SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, id);
}

export function deleteRule(id: string): void {
  const handle = db();
  handle.prepare('DELETE FROM watch_state WHERE rule_id = ?').run(id);
  handle.prepare('DELETE FROM watch_rules WHERE id = ?').run(id);
}

export function markFired(id: string): void {
  db()
    .prepare('UPDATE watch_rules SET last_fired_at = ? WHERE id = ?')
    .run(new Date().toISOString(), id);
}

/**
 * Return the subset of `keys` this rule has not seen yet, and record them.
 * This is what makes the evaluator edge-triggered: a quake already alerted on
 * never fires again, however many times the poller runs.
 */
export function claimNewKeys(ruleId: string, keys: string[]): string[] {
  const handle = db();
  const seen = handle.prepare('SELECT entity_key FROM watch_state WHERE rule_id = ?').all(ruleId) as {
    entity_key: string;
  }[];
  const known = new Set(seen.map((r) => r.entity_key));
  const fresh = [...new Set(keys)].filter((k) => !known.has(k));
  if (fresh.length === 0) return [];

  const now = new Date().toISOString();
  const insert = handle.prepare(
    'INSERT OR IGNORE INTO watch_state (rule_id, entity_key, seen_at) VALUES (?, ?, ?)'
  );
  handle.transaction((rows: string[]) => {
    for (const k of rows) insert.run(ruleId, k, now);
  })(fresh);

  return fresh;
}

interface AlertRow {
  id: string;
  rule_id: string | null;
  title: string;
  body: string;
  severity: string;
  lat: number | null;
  lng: number | null;
  payload: string | null;
  created_at: string;
  delivered: string | null;
  acknowledged_at: string | null;
}

function toAlert(row: AlertRow): Alert {
  return {
    id: row.id,
    ruleId: row.rule_id,
    title: row.title,
    body: row.body,
    severity: row.severity as Alert['severity'],
    lat: row.lat,
    lng: row.lng,
    payload: row.payload ? JSON.parse(row.payload) : null,
    createdAt: row.created_at,
    delivered: row.delivered ? JSON.parse(row.delivered) : null,
    acknowledgedAt: row.acknowledged_at,
  };
}

export function recordAlert(input: Omit<Alert, 'id' | 'createdAt' | 'delivered'>): Alert {
  const id = newId('alert');
  const createdAt = new Date().toISOString();
  db()
    .prepare(
      `INSERT INTO alerts (id, rule_id, title, body, severity, lat, lng, payload, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      input.ruleId,
      input.title,
      input.body,
      input.severity,
      input.lat,
      input.lng,
      input.payload == null ? null : JSON.stringify(input.payload),
      createdAt
    );
  return { ...input, id, createdAt, delivered: null };
}

export function recordDelivery(alertId: string, results: Record<string, string>): void {
  db().prepare('UPDATE alerts SET delivered = ? WHERE id = ?').run(JSON.stringify(results), alertId);
}

export function listAlerts(limit = 100): Alert[] {
  return (
    db().prepare('SELECT * FROM alerts ORDER BY created_at DESC, rowid DESC LIMIT ?').all(limit) as AlertRow[]
  ).map(toAlert);
}

export function updateRule(id: string, raw: RuleInput): WatchRule {
  const input = validateRule(raw);
  const previous = getRule(id);
  if (!previous) throw new Error('Watch not found.');
  const spec = { ...input.spec, ...(input.webhookUrl ? { webhookUrl: input.webhookUrl } : {}) };
  db().transaction(() => {
    db().prepare('UPDATE watch_rules SET name = ?, kind = ?, spec = ?, channels = ? WHERE id = ?')
      .run(input.name, input.kind, JSON.stringify(spec), JSON.stringify(input.channels), id);
    // Only changed matching criteria should re-arm existing entities.
    if (previous.kind !== input.kind || JSON.stringify(previous.spec) !== JSON.stringify(input.spec)) {
      db().prepare('DELETE FROM watch_state WHERE rule_id = ?').run(id);
    }
  })();
  return getRule(id)!;
}

export function snoozeRule(id: string, until: string | null): void {
  db().prepare('UPDATE watch_rules SET snoozed_until = ? WHERE id = ?').run(until, id);
}

export function acknowledgeAlert(id: string, acknowledged: boolean): boolean {
  return db().prepare('UPDATE alerts SET acknowledged_at = ? WHERE id = ?')
    .run(acknowledged ? new Date().toISOString() : null, id).changes > 0;
}
