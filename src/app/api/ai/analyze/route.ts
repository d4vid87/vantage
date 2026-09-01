/**
 * ═══════════════════════════════════════════════════════════════
 *  VANTAGE — AI Intelligence Analysis Endpoint
 *  POST /api/ai/analyze
 *  Rate-limited, multi-key Gemini integration
 * ═══════════════════════════════════════════════════════════════
 */

import { NextRequest, NextResponse } from 'next/server';
import { analyzeIntelligence, type IntelligenceContext } from '@/lib/ai-engine';
import { getProvider, ProviderUnconfiguredError, type LLMProvider } from '@/lib/ai/provider';

export const dynamic = 'force-dynamic';

/* ─────────────────────────────────────────────────────────────
   Rate Limiter — 5 requests per minute per IP
   ───────────────────────────────────────────────────────────── */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60_000;

function checkRateLimit(ip: string): { allowed: boolean; remaining: number; resetIn: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1, resetIn: RATE_LIMIT_WINDOW_MS };
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return { allowed: false, remaining: 0, resetIn: entry.resetAt - now };
  }

  entry.count++;
  return { allowed: true, remaining: RATE_LIMIT_MAX - entry.count, resetIn: entry.resetAt - now };
}

// Periodic cleanup to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap.entries()) {
    if (now > entry.resetAt) {
      rateLimitMap.delete(ip);
    }
  }
}, 120_000);

/* ─────────────────────────────────────────────────────────────
   Collect API keys from environment
   ───────────────────────────────────────────────────────────── */


/* ─────────────────────────────────────────────────────────────
   Request / Response types
   ───────────────────────────────────────────────────────────── */

interface AnalyzeRequestBody {
  query: string;
  context: IntelligenceContext;
}

interface AnalyzeResponse {
  analysis: string;
  model: string;
  timestamp: string;
}

interface ErrorResponse {
  error: string;
  code: string;
  retryAfter?: number;
}

/* ─────────────────────────────────────────────────────────────
   POST Handler
   ───────────────────────────────────────────────────────────── */

export async function POST(
  request: NextRequest
): Promise<NextResponse<AnalyzeResponse | ErrorResponse>> {
  // Extract client IP
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown';

  // Rate limit check
  const rateCheck = checkRateLimit(ip);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      {
        error: 'Rate limit exceeded. Maximum 5 requests per minute.',
        code: 'RATE_LIMITED',
        retryAfter: Math.ceil(rateCheck.resetIn / 1000),
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil(rateCheck.resetIn / 1000)),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.ceil(rateCheck.resetIn / 1000)),
        },
      }
    );
  }

  // Resolve the configured AI provider (Ollama / Claude / Gemini).
  let provider: LLMProvider;
  try {
    provider = await getProvider();
  } catch (err) {
    if (err instanceof ProviderUnconfiguredError) {
      return NextResponse.json(
        { error: err.message, code: 'NO_AI_PROVIDER' },
        { status: 503 }
      );
    }
    throw err;
  }


  // Parse request body
  let body: AnalyzeRequestBody;
  try {
    body = (await request.json()) as AnalyzeRequestBody;
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON in request body.', code: 'INVALID_BODY' },
      { status: 400 }
    );
  }

  if (!body.query || typeof body.query !== 'string' || body.query.trim().length === 0) {
    return NextResponse.json(
      { error: 'Query field is required and must be a non-empty string.', code: 'MISSING_QUERY' },
      { status: 400 }
    );
  }

  if (!body.context) {
    return NextResponse.json(
      { error: 'Intelligence context is required.', code: 'MISSING_CONTEXT' },
      { status: 400 }
    );
  }

  // Call the model
  try {
    const analysis = await analyzeIntelligence(body.context, body.query.trim(), provider);

    return NextResponse.json(
      {
        analysis,
        model: provider.model,
        provider: provider.name,
        timestamp: new Date().toISOString(),
      },
      {
        headers: {
          'X-RateLimit-Remaining': String(rateCheck.remaining),
        },
      }
    );
  } catch (err: unknown) {
    // The provider may only discover it is unusable at generate time (an
    // Ollama daemon that is not running, for instance) — surface that as the
    // same 503 the resolve step returns rather than a 500.
    if (err instanceof ProviderUnconfiguredError) {
      return NextResponse.json({ error: err.message, code: 'NO_AI_PROVIDER' }, { status: 503 });
    }
    const message = err instanceof Error ? err.message : 'Unknown Gemini API error';

    // Detect specific Gemini error types
    if (message.includes('API_KEY_INVALID') || message.includes('API key not valid')) {
      return NextResponse.json(
        { error: 'Invalid Gemini API key. Please check your configuration.', code: 'INVALID_KEY' },
        { status: 401 }
      );
    }

    if (message.includes('RESOURCE_EXHAUSTED') || message.includes('quota')) {
      return NextResponse.json(
        {
          error: 'Gemini API quota exhausted. Try again later or provide your own API key.',
          code: 'QUOTA_EXHAUSTED',
        },
        { status: 429 }
      );
    }

    if (message.includes('SAFETY')) {
      return NextResponse.json(
        {
          error: 'Response blocked by Gemini safety filters. Try rephrasing your query.',
          code: 'SAFETY_BLOCKED',
        },
        { status: 422 }
      );
    }

    console.error('[VANTAGE AI] Analysis error:', message);
    return NextResponse.json(
      { error: 'Intelligence analysis failed. Please try again.', code: 'ANALYSIS_FAILED' },
      { status: 500 }
    );
  }
}
