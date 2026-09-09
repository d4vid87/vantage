import { describe, it, expect } from 'vitest';
import { coordsOf, evaluateRule, keyOf, severityFor, type FeedSnapshot } from './evaluate';
import type { WatchRule } from './types';

function rule(partial: Partial<WatchRule>): WatchRule {
  return {
    id: 'r1',
    name: 'test rule',
    kind: 'aoi',
    spec: { ring: [], layers: [] },
    channels: [],
    enabled: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    lastFiredAt: null,
    ...partial,
  } as WatchRule;
}

// A 10x10 degree box around the origin.
const BOX = [
  [-5, -5],
  [5, -5],
  [5, 5],
  [-5, 5],
  [-5, -5],
];

const snapshot: FeedSnapshot = {
  earthquakes: [
    { id: 'eq-inside', magnitude: 6.2, latitude: 1, longitude: 1, location: 'Inside Box' },
    { id: 'eq-outside', magnitude: 7.5, latitude: 40, longitude: 40, location: 'Far Away' },
    { id: 'eq-small', magnitude: 2.6, latitude: 2, longitude: 2, location: 'Weak' },
  ],
  flights: [{ id: 'f1', icao24: 'AB12CD', callsign: 'TEST01', lat: 2, lng: 2 }],
};

describe('coordsOf', () => {
  it('reads the varying coordinate field names across feeds', () => {
    expect(coordsOf({ latitude: 3, longitude: 4 })).toEqual({ lat: 3, lng: 4 });
    expect(coordsOf({ lat: 1, lng: 2 })).toEqual({ lat: 1, lng: 2 });
    expect(coordsOf({ coords: [9, 8] })).toEqual({ lat: 8, lng: 9 });
    expect(coordsOf({ nothing: true })).toEqual({ lat: null, lng: null });
  });
});

describe('evaluateRule — aoi', () => {
  it('matches only entities inside the ring, across the requested layers', () => {
    const matches = evaluateRule(
      rule({ kind: 'aoi', spec: { ring: BOX, layers: ['earthquakes', 'flights'] } }),
      snapshot
    );
    const keys = matches.map((m) => m.key);
    expect(keys).toContain('earthquakes:eq-inside');
    expect(keys).toContain('flights:f1');
    expect(keys).not.toContain('earthquakes:eq-outside');
  });

  it('ignores layers not listed in the spec', () => {
    const matches = evaluateRule(
      rule({ kind: 'aoi', spec: { ring: BOX, layers: ['earthquakes'] } }),
      snapshot
    );
    expect(matches.every((m) => m.layer === 'earthquakes')).toBe(true);
  });

  it('matches nothing when disabled', () => {
    const matches = evaluateRule(
      rule({ enabled: false, kind: 'aoi', spec: { ring: BOX, layers: ['earthquakes'] } }),
      snapshot
    );
    expect(matches).toHaveLength(0);
  });
});

describe('evaluateRule — entity', () => {
  it('finds an aircraft by ICAO24 regardless of case', () => {
    const matches = evaluateRule(
      rule({ kind: 'entity', spec: { entityType: 'flight', identifier: 'ab12cd' } }),
      snapshot
    );
    expect(matches.map((m) => m.key)).toEqual(['flights:f1']);
  });

  it('does not match unsupported channel watches against aircraft', () => {
    const matches = evaluateRule(
      rule({ kind: 'entity', spec: { entityType: 'channel', identifier: '@TEST01' } }),
      snapshot
    );
    expect(matches).toHaveLength(0);
  });

  it('returns nothing for an empty identifier rather than matching everything', () => {
    const matches = evaluateRule(
      rule({ kind: 'entity', spec: { entityType: 'flight', identifier: '   ' } }),
      snapshot
    );
    expect(matches).toHaveLength(0);
  });
});

describe('evaluateRule — threshold', () => {
  it('fires only at or above the minimum', () => {
    const matches = evaluateRule(
      rule({ kind: 'threshold', spec: { layer: 'earthquakes', field: 'magnitude', min: 6 } }),
      snapshot
    );
    expect(matches.map((m) => m.key).sort()).toEqual([
      'earthquakes:eq-inside',
      'earthquakes:eq-outside',
    ]);
  });

  it('honours an optional bounding box', () => {
    const matches = evaluateRule(
      rule({
        kind: 'threshold',
        spec: {
          layer: 'earthquakes',
          field: 'magnitude',
          min: 6,
          bbox: { west: -5, south: -5, east: 5, north: 5 },
        },
      }),
      snapshot
    );
    expect(matches.map((m) => m.key)).toEqual(['earthquakes:eq-inside']);
  });
});

describe('severityFor', () => {
  it('escalates with earthquake magnitude', () => {
    const at = (magnitude: number) =>
      severityFor({ key: 'k', layer: 'earthquakes', record: { magnitude }, lat: 0, lng: 0, label: 'x' });
    expect(at(7.1)).toBe('CRITICAL');
    expect(at(6.1)).toBe('HIGH');
    expect(at(5.1)).toBe('ELEVATED');
    expect(at(3)).toBe('INFO');
  });

  it('passes through an explicit severity field', () => {
    expect(
      severityFor({ key: 'k', layer: 'threats', record: { severity: 'critical' }, lat: null, lng: null, label: 'x' })
    ).toBe('CRITICAL');
  });
});

describe('keyOf', () => {
  it('is stable and layer-scoped so the same id in two layers does not collide', () => {
    expect(keyOf('flights', { id: 'x' })).toBe('flights:x');
    expect(keyOf('vessels', { id: 'x' })).toBe('vessels:x');
  });
});
