import { describe, it, expect, afterEach } from 'vitest';
import { capabilities } from './route';

const saved = { ...process.env };
afterEach(() => { process.env = { ...saved }; });

describe('health capabilities', () => {
  it('reports every gated source as a boolean', () => {
    const caps = capabilities();
    for (const key of ['cloudflare', 'acled', 'openaq']) {
      expect(typeof caps[key]).toBe('boolean');
    }
  });

  it('flags a source as available only when its credentials are set', () => {
    delete process.env.ACLED_API_KEY;
    delete process.env.ACLED_EMAIL;
    expect(capabilities().acled).toBe(false);

    process.env.ACLED_API_KEY = 'k';
    expect(capabilities().acled).toBe(false); // email still missing

    process.env.ACLED_EMAIL = 'a@b.c';
    expect(capabilities().acled).toBe(true);
  });
});
