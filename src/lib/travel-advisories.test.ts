import { describe, it, expect } from 'vitest';
import { mapAdvisories, parseTitle, levelColor } from './travel-advisories';

describe('parseTitle', () => {
  it('reads country and level from the headline', () => {
    expect(parseTitle('Ukraine - Level 4: Do Not Travel')).toEqual({ country: 'Ukraine', level: 4 });
  });

  it('handles multi-word countries', () => {
    expect(parseTitle('United Arab Emirates - Level 3: Reconsider Travel')?.country).toBe('United Arab Emirates');
  });

  it('returns null for anything that is not an advisory headline', () => {
    expect(parseTitle('Worldwide Caution')).toBeNull();
  });
});

describe('mapAdvisories', () => {
  it('resolves the country from the title, not the FIPS Category code', () => {
    // The feed's Category is GEC/FIPS ("UP" for Ukraine), which would collide
    // with unrelated ISO codes if trusted.
    const [a] = mapAdvisories([{ Title: 'Ukraine - Level 4: Do Not Travel', Category: ['UP'] } as never]);
    expect(a.iso).toBe('UA');
  });

  it('keeps the highest level when a country appears more than once', () => {
    const out = mapAdvisories([
      { Title: 'Mexico - Level 2: Exercise Increased Caution' },
      { Title: 'Mexico - Level 4: Do Not Travel' },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].level).toBe(4);
  });

  it('drops entries whose country cannot be resolved', () => {
    expect(mapAdvisories([{ Title: 'Worldwide Caution - Level 2: Exercise Increased Caution' }])).toHaveLength(0);
  });

  it('sorts the most severe first', () => {
    const out = mapAdvisories([
      { Title: 'Japan - Level 1: Exercise Normal Precautions' },
      { Title: 'Iraq - Level 4: Do Not Travel' },
    ]);
    expect(out[0].iso).toBe('IQ');
  });

  it('colours each level distinctly', () => {
    const colors = [1, 2, 3, 4].map(levelColor);
    expect(new Set(colors).size).toBe(4);
  });
});
