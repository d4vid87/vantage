
import { NextResponse } from 'next/server';
import { BUILTIN_FEEDS } from '@/lib/news-feeds';

/**
 * VANTAGE — Live News Feeds v3
 * embed_allowed: true  → can be iframed directly (YouTube allows it for these channels)
 * embed_allowed: false → YouTube/broadcaster blocks embedding; open externally instead
 *
 * Tested against X-Frame-Options and YouTube's embed restrictions.
 * Channels that show "Video unavailable" or refuse iframe are marked false.
 */

const LIVE_FEEDS = BUILTIN_FEEDS;

export async function GET() {
  return NextResponse.json({
    feeds: LIVE_FEEDS,
    total: LIVE_FEEDS.length,
    categories: ['mainstream', 'government', 'finance', 'conflict', 'state'],
    timestamp: new Date().toISOString(),
  }, {
    headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=172800' },
  });
}

