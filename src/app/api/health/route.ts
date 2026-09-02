import { NextResponse } from 'next/server';
import { channelStatus } from '@/lib/alerts/dispatch';
import { checkForUpdate } from '@/lib/update-check';
import pkg from '../../../../package.json';

/**
 * Which optional, credential-gated sources this instance can actually serve.
 * The HUD reads this once at mount to decide which layer rows to show, instead
 * of probing every gated route separately.
 */
export function capabilities(): Record<string, boolean> {
  return {
    cloudflare: !!process.env.CLOUDFLARE_API_TOKEN,
    acled: !!(process.env.ACLED_API_KEY && process.env.ACLED_EMAIL),
    openaq: !!process.env.OPENAQ_API_KEY,
  };
}

export async function GET() {
  const update = await checkForUpdate(pkg.version);
  return NextResponse.json({
    status: 'operational',
    platform: 'VANTAGE',
    version: pkg.version,
    update,
    uptime: process.uptime ? Math.round(process.uptime()) : 0,
    timestamp: new Date().toISOString(),
    capabilities: capabilities(),
    channels: channelStatus(),
    endpoints: [
      '/api/flights',
      '/api/satellites',
      '/api/earthquakes',
      '/api/news',
      '/api/gdelt',
      '/api/markets',
      '/api/frontlines',
      '/api/region-dossier',
    ],
  });
}
