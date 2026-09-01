/**
 * VANTAGE — Fired alerts
 *   GET /api/alerts?limit=100   most recent alerts, newest first
 */

import { NextRequest, NextResponse } from 'next/server';
import { listAlerts } from '@/lib/alerts/store';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const raw = Number(request.nextUrl.searchParams.get('limit') ?? 100);
  const limit = Number.isFinite(raw) ? Math.min(Math.max(Math.trunc(raw), 1), 500) : 100;
  return NextResponse.json({ alerts: listAlerts(limit) });
}
