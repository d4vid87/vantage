import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { channelStatus, dispatchAlert } from './dispatch';
import type { Alert } from './types';

// The webhook channel resolves its target through the SSRF guard. Stub DNS so
// the fake test hostnames resolve to a public address; IP literals skip DNS
// entirely, so the blocked-range assertions below still exercise the real
// guard logic.
vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(async () => [{ address: '93.184.216.34', family: 4 }]),
}));

const alert: Alert = {
  id: 'alert_1',
  ruleId: 'rule_1',
  title: 'M6.2 near Testville',
  body: 'A magnitude 6.2 event occurred inside the watched area.',
  severity: 'HIGH',
  lat: 1.5,
  lng: 2.5,
  payload: { magnitude: 6.2 },
  createdAt: '2026-01-01T00:00:00.000Z',
  delivered: null,
};

const ENV_KEYS = [
  'VANTAGE_DISCORD_WEBHOOK',
  'VANTAGE_NTFY_URL',
  'VANTAGE_NTFY_TOPIC',
  'VANTAGE_NTFY_TOKEN',
  'VANTAGE_SMTP_HOST',
  'VANTAGE_SMTP_TO',
  'VANTAGE_WEBHOOK_URL',
];

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.unstubAllGlobals();
});

function stubFetch(impl?: (url: string, init?: RequestInit) => Response) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return impl ? impl(String(url), init) : new Response('ok', { status: 200 });
    })
  );
  return calls;
}

describe('dispatchAlert', () => {
  it('posts a Discord embed when the webhook is configured', async () => {
    process.env.VANTAGE_DISCORD_WEBHOOK = 'https://discord.test/hook';
    const calls = stubFetch();

    const { results } = await dispatchAlert(alert, ['discord']);

    expect(results.discord).toBe('ok');
    expect(calls[0].url).toBe('https://discord.test/hook');
    const body = JSON.parse(String(calls[0].init?.body));
    expect(body.embeds[0].title).toBe(alert.title);
  });

  it('posts to the ntfy topic with a severity-mapped priority', async () => {
    process.env.VANTAGE_NTFY_URL = 'https://ntfy.test/';
    process.env.VANTAGE_NTFY_TOPIC = 'vantage-alerts';
    const calls = stubFetch();

    const { results } = await dispatchAlert(alert, ['ntfy']);

    expect(results.ntfy).toBe('ok');
    expect(calls[0].url).toBe('https://ntfy.test/vantage-alerts');
    expect((calls[0].init?.headers as Record<string, string>).Priority).toBe('high');
  });

  it('POSTs the raw alert to a per-rule webhook override', async () => {
    const calls = stubFetch();

    const { results } = await dispatchAlert(alert, ['webhook'], {
      webhookUrl: 'https://hooks.test/inbox',
    });

    expect(results.webhook).toBe('ok');
    expect(calls[0].url).toBe('https://hooks.test/inbox');
    expect(JSON.parse(String(calls[0].init?.body)).id).toBe('alert_1');
  });

  it('reports an error per channel instead of throwing when unconfigured', async () => {
    stubFetch();
    const { results } = await dispatchAlert(alert, ['discord', 'ntfy', 'email', 'webhook']);
    expect(results.discord).toMatch(/VANTAGE_DISCORD_WEBHOOK/);
    expect(results.ntfy).toMatch(/VANTAGE_NTFY_TOPIC/);
    expect(results.email).toMatch(/VANTAGE_SMTP_HOST/);
    expect(results.webhook).toMatch(/webhook URL/);
  });

  it('keeps delivering to healthy channels when one fails', async () => {
    process.env.VANTAGE_DISCORD_WEBHOOK = 'https://discord.test/hook';
    stubFetch((url) =>
      url.includes('discord') ? new Response('bad', { status: 500 }) : new Response('ok', { status: 200 })
    );

    const { results } = await dispatchAlert(alert, ['discord', 'webhook'], {
      webhookUrl: 'https://hooks.test/inbox',
    });

    expect(results.discord).toMatch(/500/);
    expect(results.webhook).toBe('ok');
  });

  it('refuses an internal webhook target without making a request (SSRF guard)', async () => {
    const calls = stubFetch();
    const { results } = await dispatchAlert(alert, ['webhook'], {
      webhookUrl: 'http://169.254.169.254/latest/meta-data/',
    });
    expect(results.webhook).toMatch(/blocked target/i);
    expect(calls).toHaveLength(0);
  });

  it('refuses a loopback webhook target', async () => {
    const calls = stubFetch();
    const { results } = await dispatchAlert(alert, ['webhook'], {
      webhookUrl: 'http://127.0.0.1:8080/inbox',
    });
    expect(results.webhook).toMatch(/blocked target/i);
    expect(calls).toHaveLength(0);
  });

  it('surfaces a non-2xx webhook response as an error', async () => {
    stubFetch(() => new Response('nope', { status: 404 }));
    const { results } = await dispatchAlert(alert, ['webhook'], {
      webhookUrl: 'https://hooks.test/inbox',
    });
    expect(results.webhook).toMatch(/404/);
  });
});

describe('channelStatus', () => {
  it('reports nothing configured on a bare instance', () => {
    expect(channelStatus()).toEqual({ discord: false, ntfy: false, email: false, webhook: false });
  });

  it('flags a channel once its environment is set', () => {
    process.env.VANTAGE_DISCORD_WEBHOOK = 'https://discord.test/hook';
    expect(channelStatus().discord).toBe(true);
  });
});
