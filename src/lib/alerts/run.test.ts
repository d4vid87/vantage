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

it('persists every burst match and deduplicates repeated records', async () => {
  const { listAlerts } = await import('./store');
  createRule({ name: 'Burst', kind: 'threshold', spec: { layer: 'earthquakes', field: 'magnitude', min: 5 }, channels: ['webhook'], webhookUrl: 'https://hooks.test/inbox' });
  const notifications: { severity: string }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
    notifications.push(JSON.parse(String(init.body)));
    return new Response('ok');
  }));
  const rows = Array.from({ length: 12 }, (_, id) => ({ id, magnitude: id === 11 ? 8 : 6 }));
  expect(await runEvaluation({ earthquakes: [...rows, rows[0]] })).toHaveLength(12);
  expect(listAlerts()).toHaveLength(12);
  expect(notifications).toHaveLength(10);
  expect(notifications[9].severity).toBe('CRITICAL');
  expect(await runEvaluation({ earthquakes: rows })).toHaveLength(0);
});

it('includes aircraft beyond record 500 and maritime data', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify(String(url).endsWith('/api/flights')
    ? { commercial_flights: Array.from({ length: 501 }, (_, id) => ({ icao24: `plane-${id}` })) }
    : String(url).endsWith('/api/maritime') ? { ships: [{ mmsi: '123456789' }] } : {}))));
  const snap = await collectSnapshot();
  expect(snap.flights).toHaveLength(501);
  expect(snap.maritime).toHaveLength(1);
  createRule({ name: 'Last aircraft', kind: 'entity', spec: { entityType: 'flight', identifier: 'plane-500' }, channels: [] });
  expect(await runEvaluation(snap)).toHaveLength(1);
});

it('isolates a malformed legacy rule from valid rules', async () => {
  const { db } = await import('../db');
  createRule({ name: 'Good', kind: 'threshold', spec: { layer: 'earthquakes', field: 'magnitude', min: 5 }, channels: [] });
  db().prepare("INSERT INTO watch_rules (id,name,kind,spec,channels,enabled,created_at) VALUES ('broken','Broken','entity','{}','[]',1,'9999')").run();
  expect(await runEvaluation(snapshot)).toHaveLength(1);
});

it('rolls back seen keys when alert persistence fails', async () => {
  const { db } = await import('../db');
  createRule({ name: 'Reliable', kind: 'threshold', spec: { layer: 'earthquakes', field: 'magnitude', min: 5 }, channels: [] });
  db().exec("CREATE TRIGGER reject_alert BEFORE INSERT ON alerts BEGIN SELECT RAISE(FAIL, 'simulated disk failure'); END");
  expect(await runEvaluation(snapshot)).toHaveLength(0);
  db().exec('DROP TRIGGER reject_alert');
  expect(await runEvaluation(snapshot)).toHaveLength(1);
});

it('quiet hours retain every match without delivery; grouping delivers one batch', async () => {
  const {dashboardSettings,saveDashboardSettings}=await import('../dashboard/settings');
  const {DEFAULT_NOTIFICATION_POLICY}=await import('./notification-policy');
  const {listAlerts}=await import('./store');
  const fetcher=vi.fn(async()=>new Response('ok'));vi.stubGlobal('fetch',fetcher);
  const date=new Date();const time=(offset:number)=>new Date(date.getTime()+offset).toISOString().slice(11,16);
  saveDashboardSettings({...dashboardSettings(),notifications:{...DEFAULT_NOTIFICATION_POLICY,enabled:true,start:time(-3600000),end:time(3600000)}});
  createRule({name:'Quiet quake',kind:'threshold',spec:{layer:'earthquakes',field:'magnitude',min:1},channels:['webhook'],webhookUrl:'https://hooks.test/inbox'});
  const muted=await runEvaluation(snapshot);
  expect(muted).toHaveLength(2);expect(listAlerts()).toHaveLength(2);expect(fetcher).not.toHaveBeenCalled();expect(muted[0].delivered.webhook).toContain('muted');
  saveDashboardSettings({...dashboardSettings(),notifications:{...DEFAULT_NOTIFICATION_POLICY,grouped:true}});
  const next={earthquakes:snapshot.earthquakes.map(e=>({...e,id:e.id+'next'}))};
  await runEvaluation(next);expect(fetcher).toHaveBeenCalledTimes(1);expect(listAlerts()).toHaveLength(4);
});
