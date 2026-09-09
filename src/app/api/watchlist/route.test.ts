import { it, expect, beforeEach, afterAll, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NextRequest } from 'next/server';
import { POST, PATCH } from './route';
import { resetDbForTests } from '@/lib/db';
import { listRules } from '@/lib/alerts/store';
import { createWatchRule } from '@/lib/mcp-tools';
const dirs: string[] = [];
beforeEach(() => { resetDbForTests(); const dir = mkdtempSync(join(tmpdir(), 'vantage-api-watch-')); dirs.push(dir); process.env.VANTAGE_DATA_DIR = dir; vi.unstubAllGlobals(); });
afterAll(() => { resetDbForTests(); dirs.forEach(d => rmSync(d, { recursive: true, force: true })); delete process.env.VANTAGE_DATA_DIR; });
const body = { name: 'Aircraft', kind: 'entity', spec: { entityType: 'flight', identifier: 'ab1234' }, channels: [] };
const request = (value: unknown, suffix = '', method = 'POST') => new NextRequest(`http://localhost/api/watchlist${suffix}`, { method, body: JSON.stringify(value) });
it('HTTP and MCP reject incomplete rules before saving anything', async () => {
  expect((await POST(request({ ...body, spec: {} }))).status).toBe(400);
  await expect(createWatchRule({ ...body, spec: {} } as never)).rejects.toThrow();
  expect(listRules()).toHaveLength(0);
});
it('creates, edits, snoozes and rejects internal webhooks', async () => {
  expect((await POST(request({ ...body, webhookUrl: 'http://127.0.0.1' }))).status).toBe(400);
  const created = await (await POST(request(body))).json();
  expect((await PATCH(request({ ...body, name: 'Renamed' }, `?id=${created.rule.id}`, 'PATCH'))).status).toBe(200);
  expect((await PATCH(request({ snoozeMinutes: 60 }, `?id=${created.rule.id}`, 'PATCH'))).status).toBe(200);
  expect(listRules()[0]).toMatchObject({ name: 'Renamed', snoozedUntil: expect.any(String) });
});
it('preview does not persist watches or send notifications', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ commercial_flights: [{ icao24: 'ab1234' }] }))));
  const response = await POST(request(body, '?action=preview'));
  expect((await response.json()).count).toBe(1);
  expect(listRules()).toHaveLength(0);
});
