import { describe, it, expect } from 'vitest';
import { normalizeFrontlines, statusOf, colorOf } from './frontlines';

const poly = (props: Record<string, unknown>) => ({
  type: 'Feature',
  geometry: { type: 'Polygon', coordinates: [[[37.7, 48.7, 0], [37.8, 48.8, 0], [37.7, 48.7, 0]]] },
  properties: props,
});

describe('normalizeFrontlines', () => {
  it('keeps polygons and discards the unit-marker points', () => {
    // The export is ~76% Point features (unit markers, attack arrows); only the
    // polygons describe territorial control.
    const out = normalizeFrontlines({ map: { features: [
      poly({ name: 'x /// geoJSON.status.occupied', styleUrl: '#poly-A52714-2000' }),
      { type: 'Feature', geometry: { type: 'Point', coordinates: [1, 2] }, properties: { name: 'unit' } },
    ] } });
    expect(out.features).toHaveLength(1);
    expect(out.features[0].properties.status).toBe('occupied');
  });

  it('strips the altitude ordinate from every position', () => {
    const out = normalizeFrontlines({ map: { features: [poly({ name: 'a', styleUrl: '' })] } });
    const ring = (out.features[0].geometry.coordinates as number[][][])[0];
    expect(ring.every((p) => p.length === 2)).toBe(true);
  });

  it('takes the colour from styleUrl and falls back on status', () => {
    expect(colorOf('#poly-A52714-2000-77', 'occupied')).toBe('#A52714');
    expect(colorOf('', 'occupied')).toBe('#A52714');
    expect(colorOf('', 'nonsense')).toBe('#BCAAA4');
  });

  it('reads the machine status out of the trilingual name', () => {
    expect(statusOf('Статус /// Unknown /// geoJSON.status.dismissed_at')).toBe('dismissed_at');
    expect(statusOf('no marker here')).toBe('unknown');
  });

  it('keeps the readable English segment of the name', () => {
    const out = normalizeFrontlines({ map: { features: [
      poly({ name: 'Статус невідомий /// Unknown status /// geoJSON.status.unknown', styleUrl: '' }),
    ] } });
    expect(out.features[0].properties.name).toBe('Unknown status');
  });

  it('returns an empty collection rather than throwing on junk', () => {
    expect(normalizeFrontlines(null).features).toEqual([]);
    expect(normalizeFrontlines({ map: {} }).features).toEqual([]);
  });
});
