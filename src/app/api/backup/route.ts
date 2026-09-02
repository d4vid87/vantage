/**
 * VANTAGE — operator database backup.
 * VACUUM INTO produces a consistent snapshot while the database is live (WAL
 * included), unlike copying the file. Protected: the store holds watch rules,
 * alerts, briefs and investigations.
 */

import { NextResponse } from 'next/server';
import { readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const tmp = join(tmpdir(), `vantage-backup-${process.pid}-${Date.now()}.db`);
  try {
    db().exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
    const buf = await readFile(tmp);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="vantage-${new Date().toISOString().slice(0, 10)}.db"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    console.error('[VANTAGE] backup failed:', e);
    return NextResponse.json({ error: 'Backup failed.' }, { status: 500 });
  } finally {
    await unlink(tmp).catch(() => { /* nothing was written */ });
  }
}
