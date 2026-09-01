import { describe, it, expect } from 'vitest';
import { mapIodaOutages, mergeOutages, type Outage } from './internet-outages';

const cf = (country: string): Outage => ({
  id: `cf-${country}`, lat: 1, lng: 1, country, country_name: country,
  scope: 'country', event_type: 'OUTAGE', cause: 'government directive',
  description: 'Nationwide shutdown', start: '', source: 'Cloudflare Radar',
});

describe('mergeOutages', () => {
  it('prefers the Cloudflare annotation when both detect the same country', () => {
    // Cloudflare annotations are human-written and name a cause; IODA only
    // reports that connectivity fell.
    const merged = mergeOutages([cf('SD')], mapIodaOutages([{ lat: 15, lng: 30, country: 'SD', score: 900 }]));
    expect(merged).toHaveLength(1);
    expect(merged[0].source).toBe('Cloudflare Radar');
    expect(merged[0].cause).toBe('government directive');
  });

  it('keeps countries only one source saw', () => {
    const merged = mergeOutages([cf('SD')], mapIodaOutages([{ lat: 13, lng: -92, country: 'GT', score: 1 }]));
    expect(merged.map((o) => o.country).sort()).toEqual(['GT', 'SD']);
  });

  it('works with no Cloudflare token at all', () => {
    const merged = mergeOutages([], mapIodaOutages([{ lat: 13, lng: -92, country: 'GT', score: 5 }]));
    expect(merged).toHaveLength(1);
    expect(merged[0].source).toBe('IODA');
  });
});

describe('mapIodaOutages', () => {
  it('drops events with no resolved centroid', () => {
    expect(mapIodaOutages([{ country: 'ZZ', score: 1 }])).toHaveLength(0);
  });

  it('converts the unix start into an ISO timestamp', () => {
    const [o] = mapIodaOutages([{ lat: 1, lng: 1, country: 'GT', from: 1787300700 }]);
    expect(o.start).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('survives a null payload', () => {
    expect(mapIodaOutages(null)).toEqual([]);
  });
});
