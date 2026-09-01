import { describe, it, expect } from 'vitest';
import { mapOpenMeteo, mapOpenAq, classifyPm25 } from './air-quality';

const cities = [
  { name: 'Delhi', country: 'IN', lat: 28.61, lng: 77.21 },
  { name: 'Oslo', country: 'NO', lat: 59.91, lng: 10.75 },
];

describe('mapOpenMeteo', () => {
  it('pairs each result with its city by position', () => {
    const out = mapOpenMeteo(
      [{ current: { pm2_5: 180, us_aqi: 250, time: 't' } }, { current: { pm2_5: 4, us_aqi: 12, time: 't' } }],
      cities,
    );
    expect(out.map((s) => s.name)).toEqual(['Delhi', 'Oslo']);
  });

  it('keeps our own gazetteer coordinates, not the snapped grid cell', () => {
    const [s] = mapOpenMeteo([{ latitude: 28.5, longitude: 77.0, current: { pm2_5: 10 } }], [cities[0]]);
    expect(s.lat).toBe(28.61);
    expect(s.lng).toBe(77.21);
  });

  it('skips cities the API had no reading for', () => {
    expect(mapOpenMeteo([{ current: { pm2_5: null } }, { current: {} }], cities)).toHaveLength(0);
  });

  it('sorts the worst air first', () => {
    const out = mapOpenMeteo([{ current: { pm2_5: 4 } }, { current: { pm2_5: 180 } }], cities);
    expect(out[0].pm25).toBe(180);
  });
});

describe('mapOpenAq', () => {
  it('maps v3 station rows', () => {
    const out = mapOpenAq({ results: [
      { coordinates: { latitude: 1, longitude: 2 }, value: 42, location: 'Site A', locationsId: 7 },
    ] });
    expect(out[0]).toMatchObject({ lat: 1, lng: 2, pm25: 42, source: 'OpenAQ' });
  });

  it('drops rows missing coordinates or a value', () => {
    expect(mapOpenAq({ results: [{ value: 5 }, { coordinates: { latitude: 1, longitude: 2 } }] })).toHaveLength(0);
  });
});

describe('classifyPm25', () => {
  it('follows the EPA breakpoints', () => {
    expect(classifyPm25(5).level).toBe('Good');
    expect(classifyPm25(20).level).toBe('Moderate');
    expect(classifyPm25(80).level).toBe('Unhealthy');
    expect(classifyPm25(300).level).toBe('Hazardous');
  });
});
