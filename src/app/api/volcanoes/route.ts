import { NextResponse } from 'next/server';
import Parser from 'rss-parser';
import { httpText } from '@/lib/httpJson';
import { cachedSource } from '@/lib/sourceCache';
import { mapVolcanoes, type Volcano, type VolcanoItem } from '@/lib/volcanoes';

/**
 * VANTAGE — Volcanic activity (Smithsonian GVP weekly report, keyless).
 */

const parser = new Parser({
  timeout: 15000,
  customFields: { item: [['georss:point', 'point']] },
});

const load = cachedSource<Volcano>('volcanoes', async () => {
  // GVP answers 403 to rss-parser's default User-Agent, so the body is fetched
  // with the shared client (real UA, gzip) and parsed from the string.
  const xml = await httpText('https://volcano.si.edu/news/WeeklyVolcanoRSS.xml', {
    timeoutMs: 15000,
    // GVP 403s both rss-parser's default agent and the shared client's default
    // Accept: application/json — it wants an XML Accept for an XML feed.
    headers: { Accept: 'application/rss+xml, application/xml, text/xml' },
  });
  const feed = await parser.parseString(xml);
  return mapVolcanoes((feed.items ?? []) as VolcanoItem[]);
}, 6 * 60 * 60 * 1000);

export async function GET() {
  try {
    const volcanoes = await load();
    return NextResponse.json({
      volcanoes,
      total: volcanoes.length,
      source: 'Smithsonian / USGS Weekly Volcanic Activity Report',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[VANTAGE] volcano fetch failed:', error);
    return NextResponse.json({ volcanoes: [], total: 0, error: 'Volcano data unavailable' }, { status: 502 });
  }
}
