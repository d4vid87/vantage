/**
 * ═══════════════════════════════════════════════════════════════
 *  VANTAGE — Dossier export
 *  POST /api/report
 *
 *  Body: { investigationId? , name?, graph?, notes?, format?, assess? }
 *    format = 'markdown' (default) | 'html'   — 'html' is print-to-PDF ready
 *    assess = true                            — prepend an AI analyst BLUF
 * ═══════════════════════════════════════════════════════════════
 */

import { NextRequest, NextResponse } from 'next/server';
import { getInvestigation } from '@/lib/investigations';
import { renderHtml, renderMarkdown, type DossierInput, type InvestigationGraph } from '@/lib/report';
import { getProvider } from '@/lib/ai/provider';

export const dynamic = 'force-dynamic';

const ASSESS_SYSTEM = `You are the Vantage intelligence analyst. Given a link-analysis
graph of entities and relationships, write a BOTTOM LINE UP FRONT of 3-5 sentences:
what this network appears to be, the most significant relationship, and any sanctions
exposure. Plain prose, no headers, no hedging, no invented facts.`;

async function assessGraph(name: string, graph: InvestigationGraph): Promise<string | undefined> {
  try {
    const llm = await getProvider();
    const entities = graph.nodes
      .map((n) => `- ${n.label} (${n.type})${n.sanctioned ? ' [OFAC SDN MATCH]' : ''}`)
      .join('\n');
    const rels = graph.links.map((l) => `- ${l.source} ${l.label ?? '->'} ${l.target}`).join('\n');
    return await llm.generate({
      system: ASSESS_SYSTEM,
      prompt: `INVESTIGATION: ${name}\n\nENTITIES:\n${entities}\n\nRELATIONSHIPS:\n${rels}\n\nWrite the BLUF now.`,
      maxTokens: 700,
    });
  } catch (e) {
    // The dossier is useful without the narrative — degrade, don't fail.
    console.warn('[VANTAGE] dossier assessment skipped:', e);
    return undefined;
  }
}

function safeFilename(name: string): string {
  return name.replace(/[^a-z0-9._-]+/gi, '_').slice(0, 80) || 'dossier';
}

export async function POST(request: NextRequest) {
  let body: {
    investigationId?: string;
    name?: string;
    graph?: InvestigationGraph;
    notes?: string;
    format?: string;
    assess?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  let input: DossierInput;
  if (body.investigationId) {
    const investigation = getInvestigation(body.investigationId);
    if (!investigation) {
      return NextResponse.json({ error: 'Investigation not found.' }, { status: 404 });
    }
    input = { name: investigation.name, graph: investigation.graph, notes: investigation.notes };
  } else if (body.graph && Array.isArray(body.graph.nodes)) {
    input = {
      name: (body.name ?? 'Untitled Investigation').trim(),
      graph: { nodes: body.graph.nodes, links: body.graph.links ?? [] },
      notes: body.notes,
    };
  } else {
    return NextResponse.json(
      { error: 'Provide investigationId, or a graph with nodes[].' },
      { status: 400 }
    );
  }

  if (body.assess) {
    input.assessment = await assessGraph(input.name, input.graph);
  }

  const filename = safeFilename(input.name);
  if (body.format === 'html') {
    return new NextResponse(renderHtml(input), {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `inline; filename="${filename}.html"`,
      },
    });
  }

  return new NextResponse(renderMarkdown(input), {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}.md"`,
    },
  });
}
