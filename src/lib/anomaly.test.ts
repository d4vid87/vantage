import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectAnomaly, MIN_SAMPLES, MIN_DELTA } from './anomaly';
import { resetDbForTests } from './db';
import { recordCount, historyFor, pruneCounts, inCooldown, markAlerted } from './anomaly-store';

describe('detectAnomaly', () => {
  const flat = (n: number, v: number) => Array.from({ length: n }, () => v);

  it('needs a baseline before it will call anything anomalous', () => {
    expect(detectAnomaly(flat(MIN_SAMPLES - 1, 10), 1000).anomalous).toBe(false);
  });

  it('flags a doubling that also clears the absolute delta', () => {
    const v = detectAnomaly(flat(MIN_SAMPLES, 50), 120);
    expect(v.anomalous).toBe(true);
    expect(v.mean).toBe(50);
    expect(v.ratio).toBeCloseTo(2.4);
  });

  it('ignores a doubling on a quiet layer below the delta floor', () => {
    // 3 -> 7 doubles but moves fewer than MIN_DELTA items
    expect(MIN_DELTA).toBeGreaterThan(4);
    expect(detectAnomaly(flat(MIN_SAMPLES, 3), 7).anomalous).toBe(false);
  });

  it('ignores normal jitter under the ratio', () => {
    expect(detectAnomaly(flat(MIN_SAMPLES, 100), 180).anomalous).toBe(false);
  });

  it('a zero baseline with a real current count is infinite ratio, gated by delta', () => {
    const v = detectAnomaly(flat(MIN_SAMPLES, 0), 50);
    expect(v.anomalous).toBe(true);
    expect(v.ratio).toBe(Infinity);
  });
});

describe('anomaly-store', () => {
  const dirs: string[] = [];

  beforeEach(() => {
    resetDbForTests();
    const dir = mkdtempSync(join(tmpdir(), 'vantage-anomaly-'));
    dirs.push(dir);
    process.env.VANTAGE_DATA_DIR = dir;
  });

  afterAll(() => {
    resetDbForTests();
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
    delete process.env.VANTAGE_DATA_DIR;
  });

  it('history is the trailing 24h, oldest first, excluding the current tick', () => {
    const now = 1_000_000_000_000;
    recordCount('quakes', 5, now - 25 * 3600_000); // outside the window
    recordCount('quakes', 10, now - 3600_000);
    recordCount('quakes', 20, now - 60_000);
    recordCount('quakes', 99, now); // "current" — excluded by ts < now
    expect(historyFor('quakes', now)).toEqual([10, 20]);
  });

  it('prune drops rows older than the retention window', () => {
    const now = 1_000_000_000_000;
    recordCount('a', 1, now - 8 * 24 * 3600_000);
    recordCount('a', 2, now - 3600_000);
    pruneCounts(now);
    expect(historyFor('a', now)).toEqual([2]);
  });

  it('cooldown opens after markAlerted and expires', () => {
    const now = 1_000_000_000_000;
    expect(inCooldown('fires', now)).toBe(false);
    markAlerted('fires', now);
    expect(inCooldown('fires', now + 3600_000)).toBe(true);
    expect(inCooldown('fires', now + 7 * 3600_000)).toBe(false);
  });
});
