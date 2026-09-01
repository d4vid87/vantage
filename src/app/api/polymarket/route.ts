import { NextResponse } from 'next/server';
import { httpJson } from '@/lib/httpJson';
import { cachedSource } from '@/lib/sourceCache';
import { mapMarkets, type MarketSignal } from '@/lib/polymarket';

/**
 * VANTAGE — geopolitical prediction-market signals (Polymarket, keyless).
 * Panel data, not a map layer: these are probabilities, not places.
 */

const load = cachedSource<MarketSignal>('polymarket', async () => {
  const raw = await httpJson<unknown[]>(
    'https://gamma-api.polymarket.com/markets?closed=false&active=true&limit=250&order=volumeNum&ascending=false',
    { timeoutMs: 20000 },
  );
  return mapMarkets(raw as never);
}, 10 * 60 * 1000);

export async function GET() {
  try {
    const markets = await load();
    return NextResponse.json({
      markets,
      total: markets.length,
      source: 'Polymarket (public odds)',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[VANTAGE] polymarket fetch failed:', error);
    return NextResponse.json({ markets: [], total: 0, error: 'Prediction market data unavailable' }, { status: 502 });
  }
}
