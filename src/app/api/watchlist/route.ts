import { NextRequest, NextResponse } from 'next/server';
import { createRule, deleteRule, getRule, listRules, setRuleEnabled, snoozeRule, updateRule } from '@/lib/alerts/store';
import { channelStatus, dispatchAlert } from '@/lib/alerts/dispatch';
import { validateWatchInput } from '@/lib/alerts/input';
import { record, WATCH_FIELDS } from '@/lib/alerts/validation';
import { collectSnapshot } from '@/lib/alerts/run';
import { evaluateRule } from '@/lib/alerts/evaluate';

export const dynamic = 'force-dynamic';
const failure = (e: unknown) => NextResponse.json({ error: e instanceof Error ? e.message : 'Invalid request.' }, { status: 400 });

export async function GET() {
  return NextResponse.json({ rules: listRules(), channels: channelStatus(), fields: WATCH_FIELDS, capabilities: { maritime: !!process.env.AIS_API_KEY, acled: !!(process.env.ACLED_API_KEY && process.env.ACLED_EMAIL) } });
}

export async function POST(request: NextRequest) {
  try {
    const input = await validateWatchInput(await request.json());
    const action = request.nextUrl.searchParams.get('action');
    if (action === 'preview') {
      const snapshot = await collectSnapshot();
      const matches = evaluateRule({ ...input, id: 'preview', enabled: true, createdAt: '', lastFiredAt: null }, snapshot);
      return NextResponse.json({ count: matches.length, matches: matches.slice(0, 10).map(m => ({ label: m.label, layer: m.layer })), availableLayers: Object.keys(snapshot) });
    }
    if (action === 'test') {
      // Only the operator's explicit Test delivery button enters this path.
      const { results } = await dispatchAlert({ id: 'test', ruleId: null, title: `Vantage test — ${input.name}`, body: 'This is a test notification. No watch match has been recorded.', severity: 'INFO', lat: null, lng: null, payload: null, createdAt: new Date().toISOString(), delivered: null }, input.channels, { webhookUrl: input.webhookUrl });
      return NextResponse.json({ results });
    }
    if (action) throw new Error('Unknown watch action.');
    return NextResponse.json({ rule: createRule(input) }, { status: 201 });
  } catch (e) { return failure(e); }
}

export async function PATCH(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id');
  if (!id || !getRule(id)) return NextResponse.json({ error: 'Watch not found.' }, { status: 404 });
  try {
    const body: unknown = await request.json();
    if (!record(body)) throw new Error('A watch object is required.');
    if ('spec' in body) return NextResponse.json({ rule: updateRule(id, await validateWatchInput(body)) });
    if ('enabled' in body) {
      if (typeof body.enabled !== 'boolean') throw new Error('enabled must be boolean.');
      setRuleEnabled(id, body.enabled);
    } else if ('snoozeMinutes' in body) {
      if (typeof body.snoozeMinutes !== 'number' || !Number.isFinite(body.snoozeMinutes) || body.snoozeMinutes < 0 || body.snoozeMinutes > 10080) throw new Error('Snooze must be 0–10080 minutes.');
      snoozeRule(id, body.snoozeMinutes ? new Date(Date.now() + body.snoozeMinutes * 60000).toISOString() : null);
    } else throw new Error('Specify enabled, snoozeMinutes, or a complete watch.');
    return NextResponse.json({ rule: getRule(id) });
  } catch (e) { return failure(e); }
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 });
  deleteRule(id);
  return NextResponse.json({ ok: true });
}
