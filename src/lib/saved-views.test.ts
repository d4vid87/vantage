import { describe, it, expect } from 'vitest';
import { parseViews, upsertView, removeView, type SavedView } from './saved-views';

const view = (name: string, extra: Partial<SavedView> = {}): SavedView =>
  ({ name, layers: ['flights'], lat: 50, lng: 30, zoom: 5, savedAt: 1, ...extra });

describe('parseViews', () => {
  it('rejects garbage, null and non-arrays', () => {
    expect(parseViews(null)).toEqual([]);
    expect(parseViews('not json')).toEqual([]);
    expect(parseViews('{"a":1}')).toEqual([]);
  });

  it('drops malformed entries but keeps valid ones', () => {
    const raw = JSON.stringify([view('ok'), { name: 'no-coords', layers: [] }, 42]);
    expect(parseViews(raw).map(v => v.name)).toEqual(['ok']);
  });
});

describe('upsertView', () => {
  it('replaces by name case-insensitively and puts newest first', () => {
    const out = upsertView([view('Ukraine Watch'), view('cyber')], view('UKRAINE WATCH', { zoom: 7 }));
    expect(out.map(v => v.name)).toEqual(['UKRAINE WATCH', 'cyber']);
    expect(out[0].zoom).toBe(7);
  });

  it('caps the list', () => {
    const many = Array.from({ length: 30 }, (_, i) => view(`v${i}`));
    expect(upsertView(many, view('new')).length).toBeLessThanOrEqual(24);
  });
});

describe('removeView', () => {
  it('removes exactly the named view', () => {
    expect(removeView([view('a'), view('b')], 'a').map(v => v.name)).toEqual(['b']);
  });
});

it('imports valid views without silently accepting malformed coordinates', async () => {
  const { importViews } = await import('./saved-views');
  const incoming = [{ name: 'Home', lat: 1, lng: 2, zoom: 4, layers: ['earthquakes'], savedAt: 1 }];
  expect(importViews(JSON.stringify(incoming), [])).toEqual(incoming);
  expect(() => importViews(JSON.stringify([{ ...incoming[0], lat: 100 }]), incoming)).toThrow();
});
