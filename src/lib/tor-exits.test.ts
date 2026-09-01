import { describe, it, expect } from 'vitest';
import { aggregateExits } from './tor-exits';

describe('aggregateExits', () => {
  it('counts relays per country', () => {
    // Onionoo dropped per-relay coordinates, so country is the honest resolution.
    const out = aggregateExits([
      { country: 'de', observed_bandwidth: 100 },
      { country: 'de', observed_bandwidth: 50 },
      { country: 'us', observed_bandwidth: 10 },
    ]);
    const de = out.find((c) => c.country === 'DE');
    expect(de?.relays).toBe(2);
    expect(de?.bandwidth).toBe(150);
  });

  it('sorts by relay count', () => {
    const out = aggregateExits([{ country: 'us' }, { country: 'de' }, { country: 'de' }]);
    expect(out[0].country).toBe('DE');
  });

  it('drops relays with no country or no known centroid', () => {
    expect(aggregateExits([{ observed_bandwidth: 1 }, { country: 'zz' }])).toHaveLength(0);
  });

  it('tolerates missing bandwidth', () => {
    expect(aggregateExits([{ country: 'fr' }])[0].bandwidth).toBe(0);
  });
});
