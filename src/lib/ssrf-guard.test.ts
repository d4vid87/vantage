import { expect, it } from 'vitest';
import { getClientIp, validateHost } from './ssrf-guard';

it('blocks expanded IPv6 loopback', async () => {
  await expect(validateHost('0:0:0:0:0:0:0:1')).resolves.toMatchObject({ ok: false });
});

it('ignores caller supplied forwarding headers unless proxy trust is explicit', () => {
  delete process.env.VANTAGE_TRUST_PROXY;
  expect(getClientIp(new Request('https://example.test', { headers: { 'x-forwarded-for': '1.2.3.4' } }))).toBe('direct');
});
