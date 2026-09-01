import { describe, it, expect } from 'vitest';
import { mapVictims } from './ransomware';

const v = (o: Record<string, unknown> = {}) => ({ victim: 'ACME', group: 'akira', country: 'US', ...o });

describe('mapVictims', () => {
  it('places a victim near its country centroid', () => {
    const [m] = mapVictims([v()]);
    expect(m.country).toBe('US');
    expect(typeof m.lat).toBe('number');
  });

  it('spreads victims sharing a country so they stay countable', () => {
    const out = mapVictims([v(), v({ victim: 'B' }), v({ victim: 'C' })]);
    const positions = new Set(out.map((m) => `${m.lat},${m.lng}`));
    expect(positions.size).toBe(3);
  });

  it('drops entries with no country or no victim name', () => {
    expect(mapVictims([v({ country: undefined })])).toHaveLength(0);
    expect(mapVictims([v({ victim: undefined })])).toHaveLength(0);
  });

  it('honours the cap', () => {
    expect(mapVictims(Array.from({ length: 50 }, () => v()), 10)).toHaveLength(10);
  });

  it('survives a null payload', () => {
    expect(mapVictims(null)).toEqual([]);
  });
});
