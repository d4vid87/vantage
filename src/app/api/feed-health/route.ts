import { NextResponse } from 'next/server';
import { feedHealthSnapshot } from '@/lib/feed-health';

/**
 * VANTAGE — feed health. Per-upstream fetch status so a dead source is a
 * visible red row, not a silently empty layer. In-memory, resets on restart.
 */
export async function GET() {
  return NextResponse.json({
    feeds: feedHealthSnapshot(),
    timestamp: new Date().toISOString(),
  }, { headers: { 'Cache-Control': 'no-store' } });
}
