import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resetDbForTests } from '../db';
import {
  claimNewKeys,
  createRule,
  deleteRule,
  getRule,
  listAlerts,
  listRules,
  recordAlert,
  recordDelivery,
  setRuleEnabled,
} from './store';

const dirs: string[] = [];

beforeEach(() => {
  resetDbForTests();
  const dir = mkdtempSync(join(tmpdir(), 'vantage-test-'));
  dirs.push(dir);
  process.env.VANTAGE_DATA_DIR = dir;
});

afterAll(() => {
  resetDbForTests();
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  delete process.env.VANTAGE_DATA_DIR;
});

describe('watch rules', () => {
  it('round-trips a rule through SQLite with its spec and channels intact', () => {
    const created = createRule({
      name: 'Red Sea traffic',
      kind: 'aoi',
      spec: { ring: [[0, 0], [1, 0], [1, 1], [0, 0]], layers: ['maritime'] },
      channels: ['discord', 'ntfy'],
    });

    const fetched = getRule(created.id)!;
    expect(fetched.name).toBe('Red Sea traffic');
    expect(fetched.channels).toEqual(['discord', 'ntfy']);
    expect((fetched.spec as { layers: string[] }).layers).toEqual(['maritime']);
    expect(fetched.enabled).toBe(true);
  });

  it('keeps a per-rule webhook URL out of the spec body', () => {
    const rule = createRule({
      name: 'Wallet watch',
      kind: 'entity',
      spec: { entityType: 'wallet', identifier: '0xdead' },
      channels: ['webhook'],
      webhookUrl: 'https://hooks.test/inbox',
    });
    const fetched = getRule(rule.id)!;
    expect(fetched.webhookUrl).toBe('https://hooks.test/inbox');
    expect(fetched.spec).not.toHaveProperty('webhookUrl');
  });

  it('disables and deletes rules', () => {
    const rule = createRule({ name: 'x', kind: 'entity', spec: { entityType: 'flight', identifier: 'a' }, channels: [] });
    setRuleEnabled(rule.id, false);
    expect(getRule(rule.id)!.enabled).toBe(false);

    deleteRule(rule.id);
    expect(getRule(rule.id)).toBeNull();
    expect(listRules()).toHaveLength(0);
  });
});

describe('claimNewKeys — edge triggering', () => {
  it('returns each key only the first time it is seen', () => {
    const rule = createRule({ name: 'x', kind: 'entity', spec: { entityType: 'flight', identifier: 'a' }, channels: [] });

    expect(claimNewKeys(rule.id, ['a', 'b'])).toEqual(['a', 'b']);
    expect(claimNewKeys(rule.id, ['a', 'b'])).toEqual([]);
    expect(claimNewKeys(rule.id, ['b', 'c'])).toEqual(['c']);
  });

  it('scopes seen-state per rule', () => {
    const one = createRule({ name: '1', kind: 'entity', spec: { entityType: 'flight', identifier: 'a' }, channels: [] });
    const two = createRule({ name: '2', kind: 'entity', spec: { entityType: 'flight', identifier: 'a' }, channels: [] });

    claimNewKeys(one.id, ['shared']);
    expect(claimNewKeys(two.id, ['shared'])).toEqual(['shared']);
  });

  it('forgets state when the rule is deleted', () => {
    const rule = createRule({ name: 'x', kind: 'entity', spec: { entityType: 'flight', identifier: 'a' }, channels: [] });
    claimNewKeys(rule.id, ['k']);
    deleteRule(rule.id);
    const fresh = createRule({ name: 'x', kind: 'entity', spec: { entityType: 'flight', identifier: 'a' }, channels: [] });
    expect(claimNewKeys(fresh.id, ['k'])).toEqual(['k']);
  });
});

describe('alerts', () => {
  it('persists an alert before delivery and records the outcome after', () => {
    const alert = recordAlert({
      ruleId: null,
      title: 'T',
      body: 'B',
      severity: 'HIGH',
      lat: 1,
      lng: 2,
      payload: { magnitude: 6 },
    });

    expect(listAlerts()[0].id).toBe(alert.id);
    expect(listAlerts()[0].delivered).toBeNull();

    recordDelivery(alert.id, { discord: 'ok', email: 'SMTP down' });
    expect(listAlerts()[0].delivered).toEqual({ discord: 'ok', email: 'SMTP down' });
    expect(listAlerts()[0].payload).toEqual({ magnitude: 6 });
  });

  it('returns alerts newest first and honours the limit', () => {
    for (const title of ['one', 'two', 'three']) {
      recordAlert({ ruleId: null, title, body: '', severity: 'INFO', lat: null, lng: null, payload: null });
    }
    expect(listAlerts(2)).toHaveLength(2);
  });
});
