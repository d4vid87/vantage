import { describe, it, expect } from 'vitest';
import { mapOdin, outageColor } from './power-outages';

const rec = (o: Record<string, unknown>) => ({
  name: 'BENCO ELECTRIC COOPERATIVE,1884',
  utilitydisclaimer: 'Data is preliminary and subject to change',
  county: 'Blue Earth', state: 'Minnesota', metersaffected: 135,
  geo_point_2d: { lat: 44.2, lon: -94.3 }, ...o,
});

describe('mapOdin', () => {
  it('uses the utility name, not the legal disclaimer', () => {
    // `utilitydisclaimer` is boilerplate; showing it labelled every outage
    // "Data is preliminary and subject to change".
    expect(mapOdin([rec({})])[0].utility).toBe('BENCO ELECTRIC COOPERATIVE');
  });

  it('falls back when the name is absent', () => {
    expect(mapOdin([rec({ name: '' })])[0].utility).toBe('Unknown utility');
  });

  it('drops records with no customers affected', () => {
    expect(mapOdin([rec({ metersaffected: 0 })])).toHaveLength(0);
    expect(mapOdin([rec({ metersaffected: undefined })])).toHaveLength(0);
  });

  it('drops records with no centroid', () => {
    expect(mapOdin([rec({ geo_point_2d: null })])).toHaveLength(0);
  });

  it('sorts the largest outage first', () => {
    const out = mapOdin([rec({ metersaffected: 10 }), rec({ metersaffected: 5000 })]);
    expect(out.map((o) => o.customers)).toEqual([5000, 10]);
  });

  it('escalates colour with the customer count', () => {
    expect(outageColor(50)).toBe('#4FC3F7');
    expect(outageColor(500)).toBe('#FFD700');
    expect(outageColor(5000)).toBe('#FF9500');
    expect(outageColor(50000)).toBe('#D32F2F');
  });
});
