import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { checkPassword, signSession, verifySession } from './auth';

const KEYS = ['VANTAGE_AUTH_PASSWORD', 'VANTAGE_SESSION_TTL_SECONDS'];
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  process.env.VANTAGE_AUTH_PASSWORD = 'correct horse battery staple';
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('checkPassword', () => {
  it('accepts the configured password', async () => {
    await expect(checkPassword('correct horse battery staple')).resolves.toBe(true);
  });

  it('rejects a wrong password, including a prefix of the real one', async () => {
    await expect(checkPassword('correct horse')).resolves.toBe(false);
    await expect(checkPassword('')).resolves.toBe(false);
  });

  it('rejects everything when no password is configured', async () => {
    delete process.env.VANTAGE_AUTH_PASSWORD;
    await expect(checkPassword('anything')).resolves.toBe(false);
  });
});

describe('sessions', () => {
  it('round-trips a signed session', async () => {
    const token = await signSession();
    const payload = await verifySession(token);
    expect(payload).not.toBeNull();
    expect(payload!.exp).toBeGreaterThan(payload!.iat);
  });

  it('rejects a tampered signature', async () => {
    const token = await signSession();
    const [body] = token.split('.');
    await expect(verifySession(`${body}.AAAAAAAAAAAAAAAAAAAAAAAAAAAA`)).resolves.toBeNull();
  });

  it('rejects a tampered payload', async () => {
    const token = await signSession();
    const [, sig] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ iat: 0, exp: 9_999_999_999 }))
      .toString('base64url');
    await expect(verifySession(`${forged}.${sig}`)).resolves.toBeNull();
  });

  it('rejects an expired session', async () => {
    process.env.VANTAGE_SESSION_TTL_SECONDS = '1';
    const token = await signSession(Date.now());
    // Verify 10 seconds into the future.
    await expect(verifySession(token, Date.now() + 10_000)).resolves.toBeNull();
  });

  it('rejects a session signed under a different password', async () => {
    const token = await signSession();
    process.env.VANTAGE_AUTH_PASSWORD = 'rotated password';
    await expect(verifySession(token)).resolves.toBeNull();
  });

  it('rejects malformed input', async () => {
    await expect(verifySession(undefined)).resolves.toBeNull();
    await expect(verifySession('')).resolves.toBeNull();
    await expect(verifySession('not-a-token')).resolves.toBeNull();
  });
});
