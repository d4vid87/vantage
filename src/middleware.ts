import { NextResponse } from 'next/server';
import type { NextRequest, NextFetchEvent } from 'next/server';

/**
 * Optional, opt-in analytics.
 *
 * Vantage never phones home by default. Set VANTAGE_ANALYTICS_URL to the
 * ingest endpoint of an analytics server *you* control (e.g. a self-hosted
 * Umami at http://umami:3000/api/send) to enable page-view reporting.
 * With the variable unset, this middleware makes no outbound request at all.
 */
export function middleware(request: NextRequest, event: NextFetchEvent) {
  const endpoint = process.env.VANTAGE_ANALYTICS_URL;
  if (!endpoint) return NextResponse.next();

  const userAgent = request.headers.get('user-agent') || 'Vantage Client';
  const payload = {
    hostname: request.nextUrl.hostname,
    language: 'en-US',
    referrer: request.headers.get('referer') || '',
    screen: '1920x1080',
    title: 'Vantage',
    url: request.nextUrl.pathname,
    website: process.env.VANTAGE_ANALYTICS_SITE_ID || '',
  };

  event.waitUntil(
    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': userAgent },
      body: JSON.stringify({ payload, type: 'event' }),
    }).catch(() => {})
  );

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
