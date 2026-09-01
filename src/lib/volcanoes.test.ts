import { describe, it, expect } from 'vitest';
import { mapVolcanoes, splitTitle, parsePoint } from './volcanoes';

describe('splitTitle', () => {
  it('takes the country from the first parenthesised group, not a trailing one', () => {
    // GVP titles carry the reporting window after the country.
    const r = splitTitle('Ambae (Vanuatu) - Report for 20 August-26 August 2026 - New Eruptive Activity');
    expect(r).toEqual({ name: 'Ambae', country: 'Vanuatu', activity: 'New Eruptive Activity' });
  });

  it('keeps multi-word volcano names intact', () => {
    expect(splitTitle('Nevados de Chillan (Chile) - Report - Ongoing Activity').name).toBe('Nevados de Chillan');
  });

  it('degrades to the raw title when there are no parentheses', () => {
    expect(splitTitle('Something odd')).toEqual({ name: 'Something odd', country: '', activity: '' });
  });
});

describe('parsePoint', () => {
  it('reads a georss "lat lng" pair', () => {
    expect(parsePoint('-15.389 167.835')).toEqual([-15.389, 167.835]);
  });

  it('rejects junk and out-of-range coordinates', () => {
    expect(parsePoint('abc')).toBeNull();
    expect(parsePoint('999 0')).toBeNull();
    expect(parsePoint(undefined)).toBeNull();
  });
});

describe('mapVolcanoes', () => {
  it('drops items with no coordinate', () => {
    expect(mapVolcanoes([{ title: 'X (Y)' }])).toHaveLength(0);
  });

  it('maps a full item', () => {
    const [v] = mapVolcanoes([{ title: 'Krakatau (Indonesia) - Report - New Eruptive Activity', point: '-6.1 105.42', link: 'u' }]);
    expect(v).toMatchObject({ name: 'Krakatau', country: 'Indonesia', lat: -6.1, lng: 105.42 });
  });
});
