/**
 * ═══════════════════════════════════════════════════════════════
 *  VANTAGE — Single-operator authentication
 *
 *  Vantage assumes one trusted operator. Set VANTAGE_AUTH_PASSWORD and the
 *  whole app sits behind one password; leave it unset and Vantage behaves as
 *  before (appropriate only on a trusted network).
 *
 *  Sessions are stateless HMAC-signed cookies, built on Web Crypto so the
 *  same code runs in middleware (edge runtime) and in route handlers.
 * ═══════════════════════════════════════════════════════════════
 */

export const SESSION_COOKIE = 'vantage_session';

/** Seven days — long enough that a wall-mounted dashboard stays logged in. */
const DEFAULT_TTL_SECONDS = 7 * 24 * 60 * 60;

export function authPassword(): string | null {
  const raw = process.env.VANTAGE_AUTH_PASSWORD?.trim();
  return raw ? raw : null;
}

/** Auth is opt-in: with no password configured, nothing is gated. */
export function authEnabled(): boolean {
  return authPassword() !== null;
}

function sessionTtl(): number {
  const raw = Number(process.env.VANTAGE_SESSION_TTL_SECONDS || DEFAULT_TTL_SECONDS);
  return Number.isFinite(raw) && raw > 0 ? Math.trunc(raw) : DEFAULT_TTL_SECONDS;
}

/**
 * The signing key is derived from the password, so changing the password
 * invalidates every existing session — which is what an operator rotating a
 * leaked password expects.
 */
async function signingKey(): Promise<CryptoKey> {
  const password = authPassword();
  if (!password) throw new Error('auth is not configured');
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(`vantage-session:${password}`),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

function b64url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string): Uint8Array {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/** Length-independent comparison, so a mismatch leaks no timing signal. */
async function constantTimeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  // Hash first: equal-length digests make the byte loop constant-time even
  // when the inputs differ in length.
  const [da, db] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ]);
  const ba = new Uint8Array(da);
  const bb = new Uint8Array(db);
  let diff = 0;
  for (let i = 0; i < ba.length; i++) diff |= ba[i] ^ bb[i];
  return diff === 0;
}

export async function checkPassword(candidate: string): Promise<boolean> {
  const expected = authPassword();
  if (!expected) return false;
  return constantTimeEqual(candidate, expected);
}

export interface SessionPayload {
  iat: number;
  exp: number;
}

/** Mint a signed session token. */
export async function signSession(now: number = Date.now()): Promise<string> {
  const payload: SessionPayload = {
    iat: Math.floor(now / 1000),
    exp: Math.floor(now / 1000) + sessionTtl(),
  };
  const body = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await signingKey();
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return `${body}.${b64url(new Uint8Array(sig))}`;
}

/**
 * Verify a session token. Returns the payload, or null when the token is
 * malformed, forged, or expired.
 */
export async function verifySession(
  token: string | undefined | null,
  now: number = Date.now()
): Promise<SessionPayload | null> {
  if (!token) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;

  let key: CryptoKey;
  try {
    key = await signingKey();
  } catch {
    return null;
  }

  let valid: boolean;
  try {
    valid = await crypto.subtle.verify(
      'HMAC',
      key,
      fromB64url(sig) as unknown as BufferSource,
      new TextEncoder().encode(body)
    );
  } catch {
    return null;
  }
  if (!valid) return null;

  try {
    const payload = JSON.parse(new TextDecoder().decode(fromB64url(body))) as SessionPayload;
    if (typeof payload.exp !== 'number' || payload.exp * 1000 < now) return null;
    return payload;
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: sessionTtl(),
    // Secure is set only over HTTPS; a LAN instance on plain http must still
    // be able to log in.
    secure: process.env.NODE_ENV === 'production' && process.env.VANTAGE_INSECURE_COOKIE !== 'true',
  };
}
