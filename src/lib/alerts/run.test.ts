import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resetDbForTests } from '../db';
import { createRule } from './store';
import { collectSnapshot, runEvaluation } from './run';

vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(async () => [{ address: '93.184.216.34', family: 4 }]),
}));

const dirs: string[] = [];

beforeEach(() => {
  resetDbForTests();
  const dir = mkdtempSync(join(tmpdir(), 'vantage-run-'));
  dirs.push(dir);
  process.env.VANTAGE_DATA_DIR = dir;
  vi.unstubAllGlobals();
});

afterAll(() => {
  resetDbForTests();
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  delete process.env.VANTAGE_DATA_DIR;
});

const snapshot = {
  earthquakes: [
    { id: 'eq-big', magnitude: 7.1, latitude: 38, longitude: 141, location: 'Off Honshu' },
    { id: 'eq-small', magnitude: 2.2, latitude: 1, longitude: 1, location: 'Minor' },
  ],
};

describe('runEvaluation', () => {
  it('records and dispatches a new match, then stays silent on a re-run', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(String(url));
        return new Response('ok', { status: 200 });
      })
    );

    createRule({
      name: 'Major quake',
      kind: 'threshold',
      spec: { layer: 'earthquakes', field: 'magnitude', min: 6 },
      channels: ['webhook'],
      webhookUrl: 'https://hooks.test/inbox',
    });

    const first = await runEvaluation(snapshot);
    expect(first).toHaveLength(1);
    expect(first[0].delivered.webhook).toBe('ok');
    expect(calls).toHaveLength(1);

    // Edge-triggered: the same record must not alert twice.
    const second = await runEvaluation(snapshot);
    expect(second).toHaveLength(0);
    expect(calls).toHaveLength(1);
  });

  it('does nothing when no rules are configured', async () => {
    await expect(runEvaluation(snapshot)).resolves.toEqual([]);
  });

  it('skips a disabled rule', async () => {
    const rule = createRule({
      name: 'Off',
      kind: 'threshold',
      spec: { layer: 'earthquakes', field: 'magnitude', min: 6 },
      channels: [],
    });
    const { setRuleEnabled } = await import('./store');
    setRuleEnabled(rule.id, false);
    await expect(runEvaluation(snapshot)).resolves.toEqual([]);
  });
});

describe('collectSnapshot', () => {
  it('flattens the flight buckets into one layer and keeps other feeds', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('/api/earthquakes')) {
          return new Response(JSON.stringify({ earthquakes: [{ id: 'e1', magnitude: 5 }] }));
        }
        if (String(url).includes('/api/flights')) {
          return new Response(
            JSON.stringify({
              commercial_flights: [{ id: 'c1' }],
              military_flights: [{ id: 'm1' }],
            })
          );
        }
        return new Response(JSON.stringify({}));
      })
    );

    const snap = await collectSnapshot();
    expect(snap.earthquakes).toHaveLength(1);
    expect(snap.flights?.map((f) => (f as { id: string }).id).sort()).toEqual(['c1', 'm1']);
  });

  it('tolerates a failing feed without losing the others', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('/api/earthquakes')) {
          return new Response(JSON.stringify({ earthquakes: [{ id: 'e1' }] }));
        }
        throw new Error('upstream down');
      })
    );

    const snap = await collectSnapshot();
    expect(snap.earthquakes).toHaveLength(1);
    expect(snap.flights).toBeUndefined();
  });
});
