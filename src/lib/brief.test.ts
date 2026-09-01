import { describe, it, expect, beforeEach } from 'vitest';
import { shouldRunBrief, toContext } from './brief';

describe('shouldRunBrief', () => {
  const at = (h: number, m: number) => new Date(2026, 8, 1, h, m);

  it('does not fire when no time is configured', () => {
    expect(shouldRunBrief(at(7, 0), null, null)).toBe(false);
    expect(shouldRunBrief(at(7, 0), '', null)).toBe(false);
  });

  it('fires once the configured minute has arrived', () => {
    expect(shouldRunBrief(at(6, 59), '07:00', null)).toBe(false);
    expect(shouldRunBrief(at(7, 0), '07:00', null)).toBe(true);
  });

  it('still fires if the exact minute was missed under load', () => {
    // The tick is once a minute; a busy process must not skip the whole day.
    expect(shouldRunBrief(at(9, 30), '07:00', null)).toBe(true);
  });

  it('does not fire twice in the same day', () => {
    expect(shouldRunBrief(at(9, 0), '07:00', '2026-09-01')).toBe(false);
  });

  it('fires again the next day', () => {
    expect(shouldRunBrief(at(7, 5), '07:00', '2026-08-31')).toBe(true);
  });

  it('ignores a malformed time rather than firing every minute', () => {
    expect(shouldRunBrief(at(12, 0), 'breakfast', null)).toBe(false);
    expect(shouldRunBrief(at(12, 0), '7am', null)).toBe(false);
  });
});

describe('toContext', () => {
  it('renames feed fields to the ones the prompt serializer reads', () => {
    // Feeds emit lat/lng/place; the serializer calls latitude.toFixed(). A cast
    // instead of a mapping is what made the first scheduled brief crash.
    const ctx = toContext({
      earthquakes: [{ id: 'q1', magnitude: 5.2, lat: 35.6, lng: 139.7, place: 'Tokyo', depth: 10, time: 't' }],
    });
    expect(ctx.earthquakes[0].latitude).toBe(35.6);
    expect(ctx.earthquakes[0].longitude).toBe(139.7);
    expect(ctx.earthquakes[0].location).toBe('Tokyo');
  });

  it('substitutes zero for absent coordinates so serialization cannot throw', () => {
    const ctx = toContext({ earthquakes: [{ id: 'q' }] });
    expect(ctx.earthquakes[0].latitude).toBe(0);
    expect(() => ctx.earthquakes[0].latitude.toFixed(2)).not.toThrow();
  });

  it('folds unrecognised layers into threats, tagged by layer', () => {
    // A new feed should reach the model without a prompt change.
    const ctx = toContext({ volcanoes: [{ name: 'Ambae', country: 'Vanuatu', lat: -15, lng: 167 }] });
    expect(ctx.threats).toHaveLength(1);
    expect(ctx.threats[0].type).toBe('volcanoes');
    expect(ctx.threats[0].title).toBe('Ambae');
  });

  it('caps records per layer so one huge feed cannot dominate the prompt', () => {
    const many = Array.from({ length: 500 }, (_, i) => ({ id: String(i), lat: 1, lng: 1 }));
    expect(toContext({ earthquakes: many }).earthquakes.length).toBeLessThanOrEqual(25);
    expect(toContext({ fires: many }).threats.length).toBeLessThanOrEqual(25);
  });

  it('normalises news coords into a numeric pair', () => {
    const ctx = toContext({ news: [{ title: 't', coords: [50.4, 30.5], risk_score: 8 }] });
    expect(ctx.news[0].coords).toEqual([50.4, 30.5]);
  });
});
