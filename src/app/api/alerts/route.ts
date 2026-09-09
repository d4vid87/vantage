/**
 * VANTAGE — Fired alerts
 *   GET /api/alerts?limit=100   most recent alerts, newest first
 */

import { NextRequest, NextResponse } from 'next/server';
import { listAlerts, acknowledgeAlert } from '@/lib/alerts/store';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const raw = Number(request.nextUrl.searchParams.get('limit') ?? 100);
  const limit = Number.isFinite(raw) ? Math.min(Math.max(Math.trunc(raw), 1), 500) : 100;
  return NextResponse.json({ alerts: listAlerts(limit) });
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body || typeof body.id !== 'string' || typeof body.acknowledged !== 'boolean') throw new Error('id and acknowledged are required.');
    if (!acknowledgeAlert(body.id, body.acknowledged)) return NextResponse.json({ error: 'Alert not found.' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Invalid acknowledgement.' }, { status: 400 });
  }
}
