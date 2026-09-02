import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { db, resetDbForTests } from './db';
import { pruneOldData, DEFAULT_RETENTION_DAYS, AUDIT_RETENTION_DAYS } from './retention';

const dirs: string[] = [];

beforeEach(() => {
  resetDbForTests();
  const dir = mkdtempSync(join(tmpdir(), 'vantage-retention-'));
  dirs.push(dir);
  process.env.VANTAGE_DATA_DIR = dir;
});

afterAll(() => {
  resetDbForTests();
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  delete process.env.VANTAGE_DATA_DIR;
});

const DAY = 86_400_000;

function insertAlert(id: string, ageDays: number, now: number) {
  db().prepare("INSERT INTO alerts (id, title, body, created_at) VALUES (?, 't', 'b', ?)")
    .run(id, new Date(now - ageDays * DAY).toISOString());
}

describe('pruneOldData', () => {
  it('drops old alerts, keeps recent ones', () => {
    const now = Date.now();
    insertAlert('old', DEFAULT_RETENTION_DAYS + 1, now);
    insertAlert('new', 1, now);
    const result = pruneOldData(now);
    expect(result.alerts).toBe(1);
    const left = db().prepare('SELECT id FROM alerts').all() as Array<{ id: string }>;
    expect(left.map(r => r.id)).toEqual(['new']);
  });

  it('audit rows outlive the general retention window but not the audit one', () => {
    const now = Date.now();
    db().prepare("INSERT INTO recon_audit (id, tool, target, outcome, created_at) VALUES ('a', 'nmap', 'x', 'ok', ?)")
      .run(new Date(now - (DEFAULT_RETENTION_DAYS + 10) * DAY).toISOString());
    expect(pruneOldData(now).reconAudit).toBe(0); // 100 days old — audit keeps 180

    db().prepare("INSERT INTO recon_audit (id, tool, target, outcome, created_at) VALUES ('b', 'nmap', 'y', 'ok', ?)")
      .run(new Date(now - (AUDIT_RETENTION_DAYS + 1) * DAY).toISOString());
    expect(pruneOldData(now).reconAudit).toBe(1); // 181 days old — pruned
  });

  it('never touches rules or investigations', () => {
    const now = Date.now();
    db().prepare("INSERT INTO watch_rules (id, name, kind, spec, created_at) VALUES ('r1', 'n', 'aoi', '{}', ?)")
      .run(new Date(now - 400 * DAY).toISOString());
    pruneOldData(now);
    expect(db().prepare('SELECT COUNT(*) AS c FROM watch_rules').get()).toMatchObject({ c: 1 });
  });
});
