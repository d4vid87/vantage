/**
 * VANTAGE — Saved link-analysis investigations
 *   GET    /api/investigations        list
 *   GET    /api/investigations?id=…   fetch one
 *   POST   /api/investigations        create or update
 *   DELETE /api/investigations?id=…   remove
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  deleteInvestigation,
  getInvestigation,
  listInvestigations,
  saveInvestigation,
} from '@/lib/investigations';
import type { InvestigationGraph } from '@/lib/report';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id');
  if (id) {
    const investigation = getInvestigation(id);
    if (!investigation) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    return NextResponse.json({ investigation });
  }
  return NextResponse.json({ investigations: listInvestigations() });
}

export async function POST(request: NextRequest) {
  let body: { id?: string; name?: string; graph?: InvestigationGraph; notes?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const name = (body.name ?? '').trim();
  if (!name) return NextResponse.json({ error: 'name is required.' }, { status: 400 });
  if (!body.graph || !Array.isArray(body.graph.nodes) || !Array.isArray(body.graph.links)) {
    return NextResponse.json(
      { error: 'graph must be an object with nodes[] and links[].' },
      { status: 400 }
    );
  }

  const investigation = saveInvestigation({
    id: body.id,
    name,
    graph: body.graph,
    notes: body.notes,
  });
  return NextResponse.json({ investigation }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id query param is required.' }, { status: 400 });
  deleteInvestigation(id);
  return NextResponse.json({ ok: true });
}
