/**
 * ═══════════════════════════════════════════════════════════════
 *  VANTAGE — Watch evaluator tick
 *  POST /api/alerts/tick
 *
 *  The client (or a cron / systemd timer) hands over the current layer
 *  snapshot; every enabled rule is evaluated against it, new matches are
 *  persisted as alerts and fanned out to the rule's delivery channels.
 *
 *  Alerts are written to SQLite *before* dispatch, so a delivery outage
 *  loses a notification but never the alert itself.
 * ═══════════════════════════════════════════════════════════════
 */

import { NextRequest, NextResponse } from 'next/server';
import { evaluateRule, severityFor, type FeedSnapshot } from '@/lib/alerts/evaluate';
import { claimNewKeys, listRules, markFired, recordAlert, recordDelivery } from '@/lib/alerts/store';
import { dispatchAlert } from '@/lib/alerts/dispatch';

export const dynamic = 'force-dynamic';

/** Cap per rule per tick so one wide geofence can't spam every channel. */
const MAX_ALERTS_PER_RULE = 10;

export async function POST(request: NextRequest) {
  // Optional shared secret so an exposed instance can't have its evaluator
  // driven by anyone who can reach the port.
  const secret = process.env.VANTAGE_TICK_SECRET;
  if (secret && request.headers.get('x-vantage-tick-key') !== secret) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  let snapshot: FeedSnapshot;
  try {
    const body = (await request.json()) as { snapshot?: FeedSnapshot };
    snapshot = body.snapshot ?? {};
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const fired: Array<{ ruleId: string; alertId: string; delivered: Record<string, string> }> = [];

  for (const rule of listRules()) {
    const matches = evaluateRule(rule, snapshot);
    if (matches.length === 0) continue;

    const freshKeys = new Set(claimNewKeys(rule.id, matches.map((m) => m.key)));
    const fresh = matches.filter((m) => freshKeys.has(m.key)).slice(0, MAX_ALERTS_PER_RULE);
    if (fresh.length === 0) continue;

    for (const match of fresh) {
      const alert = recordAlert({
        ruleId: rule.id,
        title: `${rule.name} — ${match.label}`,
        body: `Watch "${rule.name}" matched a new ${match.layer} entity: ${match.label}.`,
        severity: severityFor(match),
        lat: match.lat,
        lng: match.lng,
        payload: match.record,
      });

      const { results } = await dispatchAlert(alert, rule.channels, {
        webhookUrl: rule.webhookUrl,
      });
      recordDelivery(alert.id, results);
      fired.push({ ruleId: rule.id, alertId: alert.id, delivered: results });
    }
    markFired(rule.id);
  }

  return NextResponse.json({ evaluated: true, fired, count: fired.length });
}
