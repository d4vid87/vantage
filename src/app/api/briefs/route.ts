import { NextResponse } from 'next/server';
import { listBriefs, briefSchedule } from '@/lib/brief';

/** VANTAGE — stored daily briefs, newest first. */
export async function GET(req: Request) {
  const limit = Number(new URL(req.url).searchParams.get('limit') || 30);
  try {
    const briefs = listBriefs(Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 100) : 30);
    return NextResponse.json({ briefs, total: briefs.length, schedule: briefSchedule() });
  } catch (error) {
    console.error('[VANTAGE] brief list failed:', error);
    return NextResponse.json({ briefs: [], error: 'Unable to read briefs' }, { status: 500 });
  }
}
