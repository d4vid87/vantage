/**
 * VANTAGE — Login
 *   GET  /api/auth/login   is auth enabled, and is this session valid?
 *   POST /api/auth/login   { password } → sets the session cookie
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  SESSION_COOKIE,
  authEnabled,
  checkPassword,
  sessionCookieOptions,
  signSession,
  verifySession,
} from '@/lib/auth';
import { getClientIp, isRateLimited } from '@/lib/ssrf-guard';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);
  return NextResponse.json({ authEnabled: authEnabled(), authenticated: !authEnabled() || !!session });
}

export async function POST(request: NextRequest) {
  if (!authEnabled()) {
    return NextResponse.json(
      { error: 'Authentication is not configured on this instance.', code: 'AUTH_DISABLED' },
      { status: 400 }
    );
  }

  // Throttle guessing. Shared with the rest of the app's limiter.
  if (isRateLimited(`login:${getClientIp(request)}`, 10, 60_000)) {
    return NextResponse.json(
      { error: 'Too many attempts. Wait a minute and try again.', code: 'RATE_LIMITED' },
      { status: 429 }
    );
  }

  let password: string;
  try {
    const body = (await request.json()) as { password?: string };
    password = String(body.password ?? '');
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  if (!(await checkPassword(password))) {
    return NextResponse.json({ error: 'Incorrect password.', code: 'BAD_PASSWORD' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await signSession(), sessionCookieOptions());
  return res;
}
