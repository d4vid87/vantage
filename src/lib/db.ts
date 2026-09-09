/**
 * ═══════════════════════════════════════════════════════════════
 *  VANTAGE — Persistent store
 *
 *  Everything Vantage needs to remember (watchlists, fired alerts, saved
 *  investigations, RECON audit trail) lives in one SQLite file so a
 *  self-hosted instance is a single volume to back up.
 *
 *  ponytail: single-file SQLite, no ORM. Swap for Postgres only if
 *  multi-operator hosting lands.
 * ═══════════════════════════════════════════════════════════════
 */

import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

let _db: Database.Database | null = null;

export function dataDir(): string {
  return process.env.VANTAGE_DATA_DIR || join(process.cwd(), 'data');
}

const MIGRATIONS = `
CREATE TABLE IF NOT EXISTS watch_rules (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  kind         TEXT NOT NULL,            -- 'aoi' | 'entity' | 'threshold'
  spec         TEXT NOT NULL,            -- JSON: geometry / entity id / threshold
  channels     TEXT NOT NULL DEFAULT '[]', -- JSON array of delivery channels
  enabled      INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL,
  last_fired_at TEXT
);

CREATE TABLE IF NOT EXISTS watch_state (
  rule_id    TEXT NOT NULL,
  entity_key TEXT NOT NULL,
  seen_at    TEXT NOT NULL,
  PRIMARY KEY (rule_id, entity_key)
);

CREATE TABLE IF NOT EXISTS alerts (
  id         TEXT PRIMARY KEY,
  rule_id    TEXT,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  severity   TEXT NOT NULL DEFAULT 'INFO',
  lat        REAL,
  lng        REAL,
  payload    TEXT,                        -- JSON of the triggering record
  created_at TEXT NOT NULL,
  delivered  TEXT                         -- JSON map channel -> ok|error
);
CREATE INDEX IF NOT EXISTS idx_alerts_created ON alerts (created_at DESC);

CREATE TABLE IF NOT EXISTS investigations (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  graph      TEXT NOT NULL,               -- JSON { nodes, links }
  notes      TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS recon_audit (
  id         TEXT PRIMARY KEY,
  tool       TEXT NOT NULL,
  target     TEXT NOT NULL,
  actor_ip   TEXT,
  outcome    TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON recon_audit (created_at DESC);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS briefs (
  id         TEXT PRIMARY KEY,
  markdown   TEXT NOT NULL,
  provider   TEXT,
  model      TEXT,
  meta       TEXT,                        -- JSON: record counts per layer
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS layer_counts (
  layer TEXT NOT NULL,
  count INTEGER NOT NULL,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_layer_counts ON layer_counts(layer, ts);
CREATE INDEX IF NOT EXISTS idx_briefs_created ON briefs (created_at DESC);
`;

export function db(): Database.Database {
  if (_db) return _db;
  const dir = dataDir();
  mkdirSync(dir, { recursive: true });
  const handle = new Database(join(dir, 'vantage.db'));
  // WAL keeps the alert poller writing while the UI reads.
  handle.pragma('journal_mode = WAL');
  handle.exec(MIGRATIONS);
  // Additive migration: preserve existing installations and their alert history.
  for (const [table, column] of [['watch_rules', 'snoozed_until'], ['alerts', 'acknowledged_at']]) {
    const columns = handle.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!columns.some(c => c.name === column)) handle.exec(`ALTER TABLE ${table} ADD COLUMN ${column} TEXT`);
  }
  _db = handle;
  return handle;
}

/** Test hook — point the store at a temp dir and reopen. */
export function resetDbForTests(): void {
  _db?.close();
  _db = null;
}

export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
