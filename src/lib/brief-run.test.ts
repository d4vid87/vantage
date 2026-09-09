import { it, expect, vi, beforeEach, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resetDbForTests } from './db';
import { generateDailyBrief, getSetting, listBriefs, briefClock, shouldRunBrief, briefSchedule } from './brief';
import * as ai from './ai-engine';
const dirs: string[] = [];
beforeEach(() => { resetDbForTests(); const dir = mkdtempSync(join(tmpdir(), 'vantage-brief-run-')); dirs.push(dir); process.env.VANTAGE_DATA_DIR = dir; vi.restoreAllMocks(); vi.unstubAllGlobals(); });
afterAll(() => { resetDbForTests(); dirs.forEach(d => rmSync(d, { recursive: true, force: true })); delete process.env.VANTAGE_DATA_DIR; vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('keeps the old baseline on failure and saves the next successful brief once', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify(String(url).endsWith('/api/earthquakes') ? { earthquakes: [{ id: 'q', magnitude: 6, lat: 1, lng: 1 }] } : String(url).endsWith('/api/news') ? { news: [{ id: 'n', title: 'News' }] } : {}))));
  const generate = vi.spyOn(ai, 'generateBriefing').mockRejectedValueOnce(new Error('offline')).mockResolvedValue('Brief');
  await expect(generateDailyBrief()).rejects.toThrow('offline');
  expect(getSetting('brief_prev_snapshot')).toBeNull();
  expect(listBriefs()).toHaveLength(0);
  const [a, b] = await Promise.all([generateDailyBrief(), generateDailyBrief()]);
  expect(a.brief.id).toBe(b.brief.id);
  expect(listBriefs()).toHaveLength(1);
  expect(getSetting('brief_prev_snapshot')).not.toBeNull();
  expect(generate.mock.calls[1][0].news[0].title).toBe('News');
});
it('handles explicit timezones and rejects impossible clock times', () => {
  expect(briefClock(new Date('2026-09-08T01:00:00Z'), 'America/Chicago').day).toBe('2026-09-07');
  expect(shouldRunBrief(new Date(), '99:99', null)).toBe(false);
});

it('reports invalid schedules without hiding stored briefs', () => {
  vi.stubEnv('VANTAGE_BRIEF_TIMEZONE', 'Invalid/Zone');
  vi.stubEnv('VANTAGE_DAILY_BRIEF', '07:00');
  try {
    expect(briefSchedule()).toMatchObject({ enabled: false, nextRun: null, error: expect.stringContaining('TIMEZONE') });
    vi.stubEnv('VANTAGE_BRIEF_TIMEZONE', 'UTC');
    vi.stubEnv('VANTAGE_DAILY_BRIEF', '99:99');
    expect(briefSchedule()).toMatchObject({ enabled: false, error: expect.stringContaining('HH:MM') });
  } finally { vi.unstubAllEnvs(); }
});
