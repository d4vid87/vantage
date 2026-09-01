/**
 * ═══════════════════════════════════════════════════════════════
 *  VANTAGE — AI Analyst Copilot
 *  POST /api/ai/chat   — grounded, multi-turn analyst conversation
 *  GET  /api/ai/chat   — which providers are configured
 * ═══════════════════════════════════════════════════════════════
 */

import { NextRequest, NextResponse } from 'next/server';
import { copilotStream, type ChatTurn, type IntelligenceContext } from '@/lib/ai-engine';
import { parseActions } from '@/lib/ai/actions';
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
  /** Set false for a single JSON response instead of a token stream. */
  stream?: boolean;
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

    // Resolve the first chunk before committing to a 200, so a provider that
    // is down still surfaces as a clean 503 rather than an empty stream.
    const iterator = copilotStream(context, history, provider)[Symbol.asyncIterator]();
    const first = await iterator.next();

    if (body.stream === false) {
      let full = first.done ? '' : first.value;
      for (let step = await iterator.next(); !step.done; step = await iterator.next()) {
        full += step.value;
      }
      const { text, actions } = parseActions(full);
      return NextResponse.json({
        answer: text,
        actions,
        provider: provider.name,
        model: provider.model,
        generatedAt: new Date().toISOString(),
      });
    }

    // NDJSON frames: {delta} while generating, then a final {done} carrying
    // the cleaned prose and any validated actions.
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));
        let full = '';
        try {
          if (!first.done) {
            full += first.value;
            send({ delta: first.value });
          }
          for (let step = await iterator.next(); !step.done; step = await iterator.next()) {
            full += step.value;
            send({ delta: step.value });
          }
          const { text, actions } = parseActions(full);
          send({
            done: true,
            answer: text,
            actions,
            provider: provider.name,
            model: provider.model,
            generatedAt: new Date().toISOString(),
          });
        } catch (err) {
          send({ error: err instanceof Error ? err.message : 'stream failed' });
        } finally {
          controller.close();
        }
      },
    });

    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Accel-Buffering': 'no',
      },
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
