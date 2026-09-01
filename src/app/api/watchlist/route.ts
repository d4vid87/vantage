/**
 * VANTAGE — Watchlist CRUD
 *   GET    /api/watchlist         list rules + channel readiness
 *   POST   /api/watchlist         create a rule
 *   PATCH  /api/watchlist?id=…    enable / disable
 *   DELETE /api/watchlist?id=…    remove
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRule, deleteRule, listRules, setRuleEnabled } from '@/lib/alerts/store';
import { channelStatus } from '@/lib/alerts/dispatch';
import { ALL_CHANNELS, type Channel, type WatchKind } from '@/lib/alerts/types';

export const dynamic = 'force-dynamic';

const KINDS: WatchKind[] = ['aoi', 'entity', 'threshold'];

export async function GET() {
  return NextResponse.json({ rules: listRules(), channels: channelStatus() });
}

export async function POST(request: NextRequest) {
  let body: {
    name?: string;
    kind?: string;
    spec?: unknown;
    channels?: string[];
    webhookUrl?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const name = (body.name ?? '').toString().trim();
  if (!name) return NextResponse.json({ error: 'name is required.' }, { status: 400 });

  if (!KINDS.includes(body.kind as WatchKind)) {
    return NextResponse.json(
      { error: `kind must be one of ${KINDS.join(', ')}.` },
      { status: 400 }
    );
  }
  if (!body.spec || typeof body.spec !== 'object') {
    return NextResponse.json({ error: 'spec object is required.' }, { status: 400 });
  }

  const channels = (body.channels ?? []).filter((c): c is Channel =>
    ALL_CHANNELS.includes(c as Channel)
  );

  // A per-rule webhook target is user-supplied and gets POSTed to by the
  // server, so constrain it to http(s) rather than accepting any scheme.
  let webhookUrl: string | undefined;
  if (body.webhookUrl) {
    try {
      const parsed = new URL(body.webhookUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('scheme');
      webhookUrl = parsed.toString();
    } catch {
      return NextResponse.json(
        { error: 'webhookUrl must be a valid http(s) URL.' },
        { status: 400 }
      );
    }
  }

  const rule = createRule({
    name,
    kind: body.kind as WatchKind,
    spec: body.spec as never,
    channels,
    webhookUrl,
  });
  return NextResponse.json({ rule }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id query param is required.' }, { status: 400 });

  let body: { enabled?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  setRuleEnabled(id, body.enabled !== false);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id query param is required.' }, { status: 400 });
  deleteRule(id);
  return NextResponse.json({ ok: true });
}
