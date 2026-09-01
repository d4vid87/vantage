import { NextResponse } from 'next/server';
import { httpJson } from '@/lib/httpJson';
import { cachedSource } from '@/lib/sourceCache';
import { mapDon, type Outbreak } from '@/lib/disease';

/**
 * VANTAGE — Disease outbreaks (WHO Disease Outbreak News, keyless).
 */

const load = cachedSource<Outbreak>('disease', async () => {
  const raw = await httpJson<{ value?: unknown[] }>(
    'https://www.who.int/api/news/diseaseoutbreaknews?$orderby=PublicationDateAndTime%20desc&$top=60',
    { timeoutMs: 20000 },
  );
  return mapDon((raw?.value ?? []) as never);
}, 60 * 60 * 1000);

export async function GET() {
  try {
    const outbreaks = await load();
    return NextResponse.json({
      outbreaks,
      total: outbreaks.length,
      source: 'WHO Disease Outbreak News',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[VANTAGE] disease fetch failed:', error);
    return NextResponse.json({ outbreaks: [], total: 0, error: 'Outbreak data unavailable' }, { status: 502 });
  }
}
