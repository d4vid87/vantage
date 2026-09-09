import { it, expect } from 'vitest';
import { validateRule } from './validation';
const valid = { name: 'Quakes', kind: 'threshold', spec: { layer: 'earthquakes', field: 'magnitude', min: 5 }, channels: [] };
it('validates watch specs and strips hidden webhook fields', () => {
  expect(validateRule(valid).spec).toEqual(valid.spec);
  for (const bad of [null, { ...valid, spec: {} }, { ...valid, channels: 'email' }, { ...valid, spec: { ...valid.spec, min: NaN } }, { ...valid, spec: { ...valid.spec, layer: 'constructor' } }, { ...valid, kind: 'entity', spec: { entityType: 'wallet', identifier: 'abc' } }]) expect(() => validateRule(bad)).toThrow();
  expect(validateRule({ ...valid, spec: { ...valid.spec, webhookUrl: 'http://127.0.0.1' } }).spec).not.toHaveProperty('webhookUrl');
});
it('rejects invalid rings and accepts dateline bounding boxes', () => {
  expect(() => validateRule({ ...valid, kind: 'aoi', spec: { layers: ['flights'], ring: [[0, 0], [1, 1], [2, 2], [0, 0]] } })).toThrow();
  expect(validateRule({ ...valid, spec: { ...valid.spec, bbox: { west: 170, east: -170, north: 10, south: -10 } } }).kind).toBe('threshold');
});
