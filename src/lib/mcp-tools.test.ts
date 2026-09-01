import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { listLayers, getLayerData, searchNews, getCountryRisk, LAYER_ROUTES, MAX_RECORDS } from './mcp-tools';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; vi.restoreAllMocks(); });

function mockJson(body: unknown) {
  globalThis.fetch = vi.fn(async () => new Response(JSON.stringify(body), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  })) as never;
}

describe('listLayers', () => {
  it('lists every layer with its route', () => {
    const layers = listLayers();
    expect(layers.length).toBe(Object.keys(LAYER_ROUTES).length);
    expect(layers.every((l) => l.route.startsWith('/api/'))).toBe(true);
  });

  it('marks which layers the copilot may also toggle', () => {
    expect(listLayers().find((l) => l.layer === 'earthquakes')?.copilot).toBe(true);
  });
});

describe('getLayerData', () => {
  it('rejects an unknown layer and names the valid ones', async () => {
    await expect(getLayerData('not_a_layer')).rejects.toThrow(/Unknown layer/);
  });

  it('caps arrays so an agent context is not flooded', async () => {
    mockJson({ outbreaks: Array.from({ length: 400 }, (_, i) => ({ id: i })) });
    const out = await getLayerData('disease') as { outbreaks: unknown[] };
    expect(out.outbreaks.length).toBeLessThanOrEqual(MAX_RECORDS);
  });

  it('never exceeds the cap even when a larger limit is asked for', async () => {
    mockJson({ outbreaks: Array.from({ length: 400 }, (_, i) => ({ id: i })) });
    const out = await getLayerData('disease', 9999) as { outbreaks: unknown[] };
    expect(out.outbreaks.length).toBeLessThanOrEqual(MAX_RECORDS);
  });

  it('passes non-array fields through untouched', async () => {
    mockJson({ outbreaks: [], total: 0, source: 'WHO' });
    expect(await getLayerData('disease')).toMatchObject({ total: 0, source: 'WHO' });
  });
});

describe('searchNews', () => {
  beforeEach(() => {
    mockJson({ news: [
      { title: 'Strike near Kyiv', description: '' },
      { title: 'Market rally', description: 'stocks up' },
    ] });
  });

  it('matches headline or summary, case-insensitively', async () => {
    expect(await searchNews('kyiv')).toHaveLength(1);
    expect(await searchNews('STOCKS')).toHaveLength(1);
  });

  it('returns everything for an empty query', async () => {
    expect(await searchNews('   ')).toHaveLength(2);
  });
});

describe('getCountryRisk', () => {
  beforeEach(() => mockJson({ countries: [{ code: 'UA', score: 100 }, { code: 'FR', score: 12 }] }));

  it('finds a country case-insensitively', async () => {
    expect(await getCountryRisk('ua')).toMatchObject({ code: 'UA' });
  });

  it('reports a miss rather than throwing', async () => {
    expect(await getCountryRisk('ZZ')).toMatchObject({ error: expect.stringContaining('ZZ') });
  });

  it('returns the ranked list when no country is given', async () => {
    expect(Array.isArray(await getCountryRisk())).toBe(true);
  });
});
