import { it, expect } from 'vitest';
import { serializeContext } from '../ai-engine';
import { mapContext } from './context';

it('serializes real map earthquakes and malformed records safely', () => {
  const text = serializeContext({ earthquakes: [null, { id: 'eq', lat: 38, lng: 141, place: 'Japan', magnitude: 6 }], news: [], threats: [], cyberAlerts: [], timestamp: '' } as never);
  expect(text).toContain('38.00,141.00');
  expect(text).toContain('[eq]');
});

it('grounds active map layers in a dateline-crossing viewport', () => {
  const ctx = mapContext({ earthquakes: [{ id: 'off', lat: 0, lng: 0 }], maritime_ships: [{ id: 'in', lat: 1, lng: -179, name: 'Ship' }, { id: 'out', lat: 1, lng: 0 }] }, { earthquakes: false, maritime: true }, { west: 170, east: -170, south: -10, north: 10 });
  expect(ctx.earthquakes).toHaveLength(0);
  expect(ctx.threats.map(t => t.id)).toEqual(['in']);
  expect(ctx.scope).toContain('1 visible');
});
