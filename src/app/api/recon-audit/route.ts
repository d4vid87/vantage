/**
 * VANTAGE — RECON audit trail
 *   GET /api/recon-audit?limit=200
 */

import { NextRequest, NextResponse } from 'next/server';
import { listAudit, reconEnabled } from '@/lib/recon-gate';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const raw = Number(request.nextUrl.searchParams.get('limit') ?? 200);
  const limit = Number.isFinite(raw) ? Math.min(Math.max(Math.trunc(raw), 1), 1000) : 200;
  return NextResponse.json({ enabled: reconEnabled(), entries: listAudit(limit) });
}
