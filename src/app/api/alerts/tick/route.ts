/**
 * ═══════════════════════════════════════════════════════════════
 *  VANTAGE — Watch evaluator tick
 *  POST /api/alerts/tick
 *
 *  Evaluates every enabled rule and dispatches new matches. Vantage runs its
 *  own scheduler in-process (see `instrumentation.ts`), so this route exists
 *  for external cron / manual runs and for handing in a snapshot the server
 *  cannot fetch itself.
 *
 *  With no body, the evaluator collects the snapshot from the feed routes.
 * ═══════════════════════════════════════════════════════════════
 */

import { NextRequest, NextResponse } from 'next/server';
import type { FeedSnapshot } from '@/lib/alerts/evaluate';
import { collectSnapshot, runEvaluation } from '@/lib/alerts/run';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  // Optional shared secret so an exposed instance can't have its evaluator
  // driven by anyone who can reach the port.
  const secret = process.env.VANTAGE_TICK_SECRET;
  if (secret && request.headers.get('x-vantage-tick-key') !== secret) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  let snapshot: FeedSnapshot | null = null;
  try {
    const body = (await request.json()) as { snapshot?: FeedSnapshot };
    if (body.snapshot) snapshot = body.snapshot;
  } catch {
    // No body / invalid JSON — fall through to server-side collection.
  }

  const resolved = snapshot ?? (await collectSnapshot());
  const fired = await runEvaluation(resolved);

  return NextResponse.json({
    evaluated: true,
    source: snapshot ? 'client' : 'server',
    layers: Object.keys(resolved),
    fired,
    count: fired.length,
  });
}
