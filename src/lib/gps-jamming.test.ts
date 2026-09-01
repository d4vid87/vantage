import { describe, it, expect } from 'vitest';
import { parseJammingCsv, classifyRatio, jammingUrl, MIN_AIRCRAFT } from './gps-jamming';

const csv = (rows: string) => `hex,count_good_aircraft,count_bad_aircraft\n${rows}`;

describe('parseJammingCsv', () => {
  it('computes the interference ratio, not the raw count', () => {
    const [c] = parseJammingCsv(csv('842c0d9ffffffff,3,7'));
    expect(c.ratio).toBeCloseTo(0.7, 3);
    expect(c.level).toBe('Severe');
  });

  it('ignores cells with too few aircraft to be meaningful', () => {
    // One aircraft with a bad fix is not a jamming event.
    expect(parseJammingCsv(csv('8400581ffffffff,1,1'))).toHaveLength(0);
    expect(parseJammingCsv(csv(`8400581ffffffff,${MIN_AIRCRAFT},1`))).toHaveLength(1);
  });

  it('drops cells where navigation is healthy', () => {
    expect(parseJammingCsv(csv('8400581ffffffff,50,0'))).toHaveLength(0);
  });

  it('sorts the worst interference first', () => {
    const out = parseJammingCsv(csv('a,9,1\nb,1,9'));
    expect(out[0].h3).toBe('b');
  });

  it('returns nothing for an empty or headerless body', () => {
    expect(parseJammingCsv('')).toEqual([]);
    expect(parseJammingCsv('nonsense\n1,2,3')).toEqual([]);
  });

  it('bands the ratio', () => {
    expect(classifyRatio(0.05).level).toBe('Low');
    expect(classifyRatio(0.2).level).toBe('Moderate');
    expect(classifyRatio(0.9).level).toBe('Severe');
  });
});

describe('jammingUrl', () => {
  it('builds the per-UTC-day filename', () => {
    expect(jammingUrl(new Date('2026-08-30T12:00:00Z'))).toBe('https://gpsjam.org/data/2026-08-30-h3_4.csv');
  });
});
