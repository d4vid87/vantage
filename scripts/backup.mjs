#!/usr/bin/env node
/**
 * VANTAGE — SQLite backup
 *
 * Takes a consistent online copy of the store (watchlists, alerts,
 * investigations, RECON audit trail) without stopping the server. Uses
 * SQLite's own backup API, so it is safe while the scheduler is writing.
 *
 *   node scripts/backup.mjs [destination]
 *
 * Default destination: <VANTAGE_DATA_DIR>/backups/vantage-<timestamp>.db
 */

import Database from 'better-sqlite3';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const dataDir = process.env.VANTAGE_DATA_DIR || join(process.cwd(), 'data');
const source = join(dataDir, 'vantage.db');

if (!existsSync(source)) {
  console.error(`No database at ${source}. Set VANTAGE_DATA_DIR if it lives elsewhere.`);
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const dest = resolve(process.argv[2] || join(dataDir, 'backups', `vantage-${stamp}.db`));
mkdirSync(dirname(dest), { recursive: true });

const db = new Database(source, { readonly: true });
try {
  await db.backup(dest);
  console.log(`Backed up ${source} → ${dest}`);
} finally {
  db.close();
}
