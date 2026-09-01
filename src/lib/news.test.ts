import { describe, it, expect } from 'vitest';
import { dedupe, normalizeTitle, findCoords, scoreRisk, buildNews } from './news';

describe('normalizeTitle / dedupe', () => {
  it('collapses the same headline syndicated across outlets', () => {
    // Wire copy is republished verbatim with different URLs, so the URL is a
    // useless dedupe key.
    const out = dedupe([
      { title: 'Russia strikes Kyiv overnight', link: 'https://a.com/1' },
      { title: 'Russia strikes Kyiv overnight', link: 'https://b.com/2' },
    ]);
    expect(out).toHaveLength(1);
  });

  it('ignores punctuation and smart quotes when comparing', () => {
    expect(normalizeTitle('Iran’s "new" plan!')).toBe(normalizeTitle("Iran's new plan"));
  });

  it('keeps genuinely different headlines', () => {
    expect(dedupe([{ title: 'A happened' }, { title: 'B happened' }])).toHaveLength(2);
  });

  it('drops entries with no title', () => {
    expect(dedupe([{ title: '' }, { link: 'x' }])).toHaveLength(0);
  });
});

describe('findCoords', () => {
  it('prefers a city over the country containing it', () => {
    // "Kyiv" localises the story far better than "Ukraine".
    const kyiv = findCoords('Explosions reported in Kyiv');
    expect(kyiv![0]).toBeCloseTo(50.45, 1);
    expect(kyiv![1]).toBeCloseTo(30.52, 1);
    expect(kyiv).not.toEqual(findCoords('Sanctions on Ukraine'));
  });

  it('matches whole words only', () => {
    // "Mali" sits inside "Somalia"; a substring match would misplace the story.
    const somalia = findCoords('Fighting in Somalia continues');
    expect(somalia).not.toEqual(findCoords('Fighting in Mali continues'));
  });

  it('prefers the longer name when two overlap', () => {
    expect(findCoords('South Korea reports inflation')).not.toEqual(findCoords('North Korea test'));
  });

  it('resolves conflict datelines the city list does not carry', () => {
    expect(findCoords('Aid enters Gaza')).toEqual([31.416, 34.333]);
  });

  it('returns null when no place is named', () => {
    expect(findCoords('Markets rally on earnings')).toBeNull();
  });
});

describe('scoreRisk', () => {
  it('rises with conflict language and caps at 10', () => {
    expect(scoreRisk('local council meeting')).toBe(1);
    // missile + strike + war, each worth 2 over a baseline of 1.
    expect(scoreRisk('missile strike in war')).toBe(7);
    expect(scoreRisk('war missile strike attack invasion killed destroyed')).toBe(10);
  });
});

describe('buildNews', () => {
  it('builds stable ids and sorts newest first', () => {
    const out = buildNews([
      { title: 'Older', link: 'a', pubDate: '2026-01-01T00:00:00Z' },
      { title: 'Newer', link: 'b', pubDate: '2026-06-01T00:00:00Z' },
    ]);
    expect(out.map((n) => n.title)).toEqual(['Newer', 'Older']);
    expect(out[0].id).toMatch(/^[a-f0-9]{32}$/);
  });

  it('reports how a story was placed', () => {
    const [n] = buildNews([{ title: 'Strike in Kyiv', link: 'a', pubDate: '2026-06-01T00:00:00Z' }]);
    expect(n.geo_source).toBe('gazetteer');
    expect(n.coords_default).toBe(false);
  });

  it('emits coords as [lat, lng], the order the map layer expects', () => {
    const [n] = buildNews([{ title: 'News from Kyiv', link: 'a' }]);
    expect(n.coords?.[0]).toBeCloseTo(50.45, 1);
    expect(n.coords?.[1]).toBeCloseTo(30.52, 1);
  });
});
