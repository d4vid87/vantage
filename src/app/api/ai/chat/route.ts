/**
 * ═══════════════════════════════════════════════════════════════
 *  VANTAGE — AI Analyst Copilot
 *  POST /api/ai/chat   — grounded, multi-turn analyst conversation
 *  GET  /api/ai/chat   — which providers are configured
 * ═══════════════════════════════════════════════════════════════
 */

import { NextRequest, NextResponse } from 'next/server';
import { copilotAnswer, type ChatTurn, type IntelligenceContext } from '@/lib/ai-engine';
import {
  getProvider,
  providerStatus,
  selectedProvider,
  ProviderUnconfiguredError,
} from '@/lib/ai/provider';

export const dynamic = 'force-dynamic';

/* Rate limit — 20 turns per minute per IP. Chat is chattier than briefings. */
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 60_000;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): { allowed: boolean; resetIn: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, resetIn: RATE_LIMIT_WINDOW_MS };
  }
  if (entry.count >= RATE_LIMIT_MAX) return { allowed: false, resetIn: entry.resetAt - now };
  entry.count++;
  return { allowed: true, resetIn: entry.resetAt - now };
}

function clientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

const MAX_HISTORY = 20;
const MAX_MESSAGE_CHARS = 4000;

interface ChatBody {
  messages?: ChatTurn[];
  context?: IntelligenceContext;
}

export async function GET() {
  let selected: string;
  try {
    selected = selectedProvider();
  } catch {
    selected = 'ollama';
  }
  return NextResponse.json({ selected, configured: providerStatus() });
}

export async function POST(request: NextRequest) {
  const rate = checkRateLimit(clientIp(request));
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded.', code: 'RATE_LIMITED' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(rate.resetIn / 1000)) } }
    );
  }

  let body: ChatBody;
  try {
    body = (await request.json()) as ChatBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.', code: 'INVALID_BODY' }, { status: 400 });
  }

  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (messages.length === 0) {
    return NextResponse.json(
      { error: 'messages[] is required.', code: 'MISSING_MESSAGES' },
      { status: 400 }
    );
  }
  // Trim to the most recent turns and cap each one so a runaway client can't
  // blow up the prompt (or the bill, on hosted providers).
  const history: ChatTurn[] = messages.slice(-MAX_HISTORY).map((m) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: String(m.content ?? '').slice(0, MAX_MESSAGE_CHARS),
  }));

  const context: IntelligenceContext = body.context ?? {
    earthquakes: [],
    news: [],
    threats: [],
    cyberAlerts: [],
    timestamp: new Date().toISOString(),
  };

  try {
    const provider = await getProvider();
    const answer = await copilotAnswer(context, history, provider);
    return NextResponse.json({
      answer,
      provider: provider.name,
      model: provider.model,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    if (err instanceof ProviderUnconfiguredError) {
      return NextResponse.json({ error: err.message, code: 'NO_AI_PROVIDER' }, { status: 503 });
    }
    const message = err instanceof Error ? err.message : 'Unknown AI error';
    console.error('[VANTAGE] copilot failed:', message);
    return NextResponse.json({ error: message, code: 'AI_ERROR' }, { status: 502 });
  }
}
