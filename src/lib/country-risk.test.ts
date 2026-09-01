import { describe, it, expect } from 'vitest';
import { scoreCountries, advisoryPoints, levelFor, type RiskInputs } from './country-risk';

const empty: RiskInputs = { base: {}, advisories: {}, outages: {}, ransomware: {}, conflicts: {}, seismic: {} };

describe('scoreCountries', () => {
  it('returns every component that produced the score', () => {
    // An unauditable number is not an assessment.
    const [c] = scoreCountries({ ...empty, base: { UA: { base: 85, tags: [] } }, advisories: { UA: 4 } });
    expect(c.components.base).toBe(85);
    expect(c.components.advisory).toBe(18);
    expect(Object.values(c.components).reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(c.score);
  });

  it('degrades to the baseline when live inputs are missing', () => {
    const [c] = scoreCountries({ ...empty, base: { SO: { base: 82, tags: ['terrorism'] } } });
    expect(c.score).toBe(82);
    expect(c.components.outages).toBe(0);
    expect(c.tags).toEqual(['terrorism']);
  });

  it('scores a country the baseline never listed', () => {
    const [c] = scoreCountries({ ...empty, outages: { GT: 5 }, ransomware: { GT: 3 } });
    expect(c.code).toBe('GT');
    expect(c.score).toBeGreaterThan(0);
  });

  it('clamps to 0..100', () => {
    const [c] = scoreCountries({
      ...empty, base: { XX: { base: 99, tags: [] } }, advisories: { XX: 4 },
      outages: { XX: 99 }, ransomware: { XX: 99 }, conflicts: { XX: 99 }, seismic: { XX: 99 },
    });
    expect(c.score).toBe(100);
  });

  it('applies diminishing returns rather than counting linearly', () => {
    // The tenth outage says far less than the first.
    const one = scoreCountries({ ...empty, outages: { A: 1 } })[0].components.outages;
    const ten = scoreCountries({ ...empty, outages: { A: 10 } })[0].components.outages;
    expect(ten).toBeGreaterThan(one);
    expect(ten).toBeLessThan(one * 10);
  });

  it('sorts most unstable first', () => {
    const out = scoreCountries({ ...empty, base: { A: { base: 10, tags: [] }, B: { base: 90, tags: [] } } });
    expect(out.map((c) => c.code)).toEqual(['B', 'A']);
  });
});

describe('advisoryPoints', () => {
  it('weights the State Department scale monotonically', () => {
    expect(advisoryPoints(1)).toBe(0);
    expect(advisoryPoints(4)).toBeGreaterThan(advisoryPoints(3));
    expect(advisoryPoints(undefined)).toBe(0);
  });

  it('cannot manufacture a crisis on its own', () => {
    expect(advisoryPoints(4)).toBeLessThan(25);
  });
});

describe('levelFor', () => {
  it('bands the score', () => {
    expect(levelFor(95).level).toBe('CRITICAL');
    expect(levelFor(70).level).toBe('HIGH');
    expect(levelFor(50).level).toBe('ELEVATED');
    expect(levelFor(5).level).toBe('LOW');
  });
});
