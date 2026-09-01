import { describe, it, expect } from 'vitest';
import { isoForName, countriesFromTitle, normalizeName } from './countryNames';

describe('isoForName', () => {
  it('resolves the common spellings of the same country', () => {
    for (const n of ['Democratic Republic of the Congo', 'DR Congo', 'DRC', 'the Democratic Republic of Congo']) {
      expect(isoForName(n)).toBe('CD');
    }
  });

  it('keeps Congo-Brazzaville distinct from the DRC', () => {
    expect(isoForName('Congo')).toBe('CG');
    expect(isoForName('Democratic Republic of the Congo')).toBe('CD');
  });

  it('is case and punctuation insensitive', () => {
    expect(isoForName('UNITED STATES')).toBe('US');
    expect(isoForName('U.S.A.')).toBe('US');
    expect(isoForName('  united   kingdom ')).toBe('GB');
  });

  it('handles the renamed and accented forms', () => {
    expect(isoForName('Türkiye')).toBe('TR');
    expect(isoForName("Côte d'Ivoire")).toBe('CI');
    expect(isoForName('Viet Nam')).toBe('VN');
  });

  it('returns null for a non-country', () => {
    expect(isoForName('Global')).toBeNull();
    expect(isoForName('Multi-locations')).toBeNull();
    expect(isoForName('')).toBeNull();
    expect(isoForName(null)).toBeNull();
  });

  it('strips parenthesised qualifiers', () => {
    expect(normalizeName('Iran (Islamic Republic of)')).toBe('iran');
  });
});

describe('countriesFromTitle', () => {
  it('reads the country after a dash separator', () => {
    expect(countriesFromTitle('Nipah virus disease - India')).toEqual(['IN']);
  });

  it('reads the country after a comma separator', () => {
    expect(countriesFromTitle('Measles, Bangladesh')).toEqual(['BD']);
  });

  it('returns every co-affected country', () => {
    // WHO joins them with "&" or "and" in one headline.
    expect(countriesFromTitle('Ebola disease, Democratic Republic of the Congo & Uganda').sort())
      .toEqual(['CD', 'UG']);
  });

  it('returns nothing for a global or multi-location scope', () => {
    expect(countriesFromTitle('Yellow fever - Global')).toEqual([]);
    expect(countriesFromTitle('Hantavirus outbreak linked to cruise ship travel, Multi-locations')).toEqual([]);
  });

  it('does not duplicate a country named twice', () => {
    expect(countriesFromTitle('Cholera - Sudan, Sudan')).toEqual(['SD']);
  });
});
