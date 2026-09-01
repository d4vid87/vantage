import { describe, it, expect } from 'vitest';
import { mapBalloons, phaseOf } from './balloons';

describe('mapBalloons', () => {
  it('turns the serial-keyed object into an array', () => {
    const out = mapBalloons({ X1: { lat: 1, lon: 2, alt: 100, serial: 'X1' } });
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('sonde-X1');
  });

  it('drops frames with no position or an impossible one', () => {
    expect(mapBalloons({
      a: { alt: 100 },
      b: { lat: 200, lon: 0 },
      c: { lat: 0, lon: 999 },
    })).toHaveLength(0);
  });

  it('survives a null or malformed payload', () => {
    expect(mapBalloons(null)).toEqual([]);
    expect(mapBalloons({ a: null as never })).toEqual([]);
  });

  it('sorts by altitude, highest first', () => {
    const out = mapBalloons({
      low: { lat: 1, lon: 1, alt: 500 },
      high: { lat: 2, lon: 2, alt: 30000 },
    });
    expect(out.map((b) => b.altitude)).toEqual([30000, 500]);
  });
});

describe('phaseOf', () => {
  it('reads vertical velocity when it is reported', () => {
    expect(phaseOf(-17, 20000).phase).toBe('Descending');
    expect(phaseOf(5, 5000).phase).toBe('Ascending');
  });

  it('calls a high-altitude sonde airborne when velocity is missing', () => {
    // Many uploaders omit vel_v; altitude alone must not read as 'Ground'.
    expect(phaseOf(null, 20552).phase).toBe('Airborne');
    expect(phaseOf(null, 30000).phase).toBe('Float');
  });

  it('only calls a sonde grounded when it is actually near the surface', () => {
    expect(phaseOf(null, 120).phase).toBe('Ground');
  });
});
