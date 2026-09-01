import { describe, it, expect } from 'vitest';
import { mapMarkets, yesProbability, topicsFor } from './polymarket';

describe('yesProbability', () => {
  it('parses the JSON-encoded strings the Gamma API nests in its JSON', () => {
    expect(yesProbability('["Yes", "No"]', '["0.165", "0.835"]')).toBeCloseTo(0.165, 4);
  });

  it('locates Yes rather than assuming it is first', () => {
    expect(yesProbability('["No", "Yes"]', '["0.9", "0.1"]')).toBeCloseTo(0.1, 4);
  });

  it('returns null on malformed or mismatched input', () => {
    expect(yesProbability('not json', '[]')).toBeNull();
    expect(yesProbability('["Yes"]', '["0.1","0.2"]')).toBeNull();
    expect(yesProbability('["Up","Down"]', '["0.5","0.5"]')).toBeNull();
  });
});

describe('topicsFor', () => {
  it('tags conflict and election language', () => {
    expect(topicsFor('Will the U.S. invade Iran before 2027?')).toContain('conflict');
    expect(topicsFor('Who will be the next Prime Minister?')).toContain('election');
  });

  it('returns nothing for an unrelated market', () => {
    expect(topicsFor('Will it rain in Denver tomorrow?')).toEqual([]);
  });
});

describe('mapMarkets', () => {
  it('keeps only geopolitical markets', () => {
    const out = mapMarkets([
      { question: 'Will the U.S. invade Iran before 2027?', slug: 'a', volumeNum: 10 },
      { question: 'Best picture winner?', slug: 'b', volumeNum: 999 },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].slug).toBe('a');
  });

  it('orders by volume and honours the limit', () => {
    const out = mapMarkets([
      { question: 'war A?', slug: 'a', volumeNum: 1 },
      { question: 'war B?', slug: 'b', volumeNum: 100 },
    ], 1);
    expect(out.map((m) => m.slug)).toEqual(['b']);
  });
});
