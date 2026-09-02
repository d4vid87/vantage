/**
 * VANTAGE — anomaly persistence: per-layer counts over time in SQLite, plus
 * the per-layer alert cooldown (kept in the settings table).
 */

import { db } from './db';
import { getSetting, setSetting } from './brief';
import { COOLDOWN_MS } from './anomaly';

const HISTORY_WINDOW_MS = 24 * 60 * 60 * 1000;
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export function recordCount(layer: string, count: number, ts = Date.now()): void {
  db().prepare('INSERT INTO layer_counts (layer, count, ts) VALUES (?, ?, ?)').run(layer, count, ts);
}

/** Trailing 24h of counts, oldest first, excluding anything at/after `now`. */
export function historyFor(layer: string, now = Date.now()): number[] {
  const rows = db()
    .prepare('SELECT count FROM layer_counts WHERE layer = ? AND ts >= ? AND ts < ? ORDER BY ts')
    .all(layer, now - HISTORY_WINDOW_MS, now) as Array<{ count: number }>;
  return rows.map((r) => r.count);
}

export function pruneCounts(now = Date.now()): void {
  db().prepare('DELETE FROM layer_counts WHERE ts < ?').run(now - RETENTION_MS);
}

export function inCooldown(layer: string, now = Date.now()): boolean {
  const last = getSetting(`anomaly_last_${layer}`);
  return last !== null && now - Number(last) < COOLDOWN_MS;
}

export function markAlerted(layer: string, now = Date.now()): void {
  setSetting(`anomaly_last_${layer}`, String(now));
}
