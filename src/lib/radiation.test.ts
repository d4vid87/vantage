import { describe, it, expect } from 'vitest';
import { mapRadiation, classify, CPM_PER_USVH } from './radiation';

const m = (o: Record<string, unknown>) => ({
  id: 1, value: 30, unit: 'cpm', latitude: 35.6, longitude: 139.7,
  captured_at: '2026-09-01T00:00:00Z', ...o,
});

describe('mapRadiation', () => {
  it('converts CPM to microsieverts using the pancake-tube factor', () => {
    const [s] = mapRadiation([m({ value: CPM_PER_USVH })]);
    expect(s.usvh).toBeCloseTo(1, 4);
  });

  it('passes through readings already in usv', () => {
    const [s] = mapRadiation([m({ value: 0.19, unit: 'usv' })]);
    expect(s.usvh).toBeCloseTo(0.19, 4);
  });

  it('drops rows whose unit is not a dose', () => {
    expect(mapRadiation([m({ unit: 'celcius', value: 22 }), m({ unit: 'status', value: 1 })])).toHaveLength(0);
  });

  it('drops rows with no coordinates or a negative reading', () => {
    expect(mapRadiation([m({ latitude: null }), m({ longitude: null }), m({ value: -5 })])).toHaveLength(0);
  });

  it('keeps the highest reading per location bucket', () => {
    // A single bGeigie drive logs many points metres apart; under-reporting a
    // hot spot would be the dangerous direction to round.
    const out = mapRadiation([
      m({ id: 1, value: 100, latitude: 35.601, longitude: 139.701 }),
      m({ id: 2, value: 900, latitude: 35.602, longitude: 139.702 }),
      m({ id: 3, value: 200, latitude: 35.603, longitude: 139.703 }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].reading).toBe(900);
  });

  it('keeps distinct locations apart and sorts hottest first', () => {
    const out = mapRadiation([
      m({ id: 1, value: 100, latitude: 10, longitude: 10 }),
      m({ id: 2, value: 5000, latitude: 50, longitude: 50 }),
    ]);
    expect(out).toHaveLength(2);
    expect(out[0].reading).toBe(5000);
  });

  it('escalates the band as the dose rises', () => {
    expect(classify(0.05).level).toBe('Background');
    expect(classify(0.5).level).toBe('Raised');
    expect(classify(5).level).toBe('Elevated');
    expect(classify(50).level).toBe('Severe');
  });
});
