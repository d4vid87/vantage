import { NextResponse } from 'next/server';
import type { NextRequest, NextFetchEvent } from 'next/server';
import { SESSION_COOKIE, authEnabled, verifySession } from '@/lib/auth';

/**
 * API prefixes that expose operator state or act on the operator's behalf.
 * The public feed routes (flights, earthquakes, …) stay open: they carry only
 * upstream public data, and the in-process scheduler fetches them over
 * loopback. Lock those down too by putting a reverse proxy in front.
 */
const PROTECTED_API = [
  '/api/investigations',
  '/api/alerts',
  '/api/watchlist',
  '/api/recon-audit',
  '/api/scanner',
  '/api/report',
  '/api/ai',
  '/api/osint',
  '/api/briefs',
];

function isProtectedApi(path: string): boolean {
  return PROTECTED_API.some((p) => path === p || path.startsWith(`${p}/`));
}

/** Paths that must stay reachable while logged out. */
function isPublicPath(path: string): boolean {
  return (
    path === '/login' ||
    path.startsWith('/api/auth/') ||
    path === '/api/health' ||
    // MCP enforces its own bearer check in-route: a programmatic client must
    // get a 401, never a redirect to the login page.
    path === '/api/mcp' ||
    path.startsWith('/_next/') ||
    path === '/favicon.ico'
  );
}

/**
 * Optional, opt-in analytics.
 *
 * Vantage never phones home by default. Set VANTAGE_ANALYTICS_URL to the
 * ingest endpoint of an analytics server *you* control to enable page-view
 * reporting. With the variable unset, no outbound request is made at all.
 */
function reportPageView(request: NextRequest, event: NextFetchEvent): void {
  const endpoint = process.env.VANTAGE_ANALYTICS_URL;
  if (!endpoint) return;

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
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': request.headers.get('user-agent') || 'Vantage Client',
      },
      body: JSON.stringify({ payload, type: 'event' }),
    }).catch(() => {})
  );
}

export async function proxy(request: NextRequest, event: NextFetchEvent) {
  const path = request.nextUrl.pathname;

  if (authEnabled() && !isPublicPath(path)) {
    const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);
    if (!session) {
      if (path.startsWith('/api/')) {
        // Only gate the sensitive API surface; public feeds stay open.
        if (isProtectedApi(path)) {
          return NextResponse.json(
            { error: 'Authentication required.', code: 'UNAUTHENTICATED' },
            { status: 401 }
          );
        }
      } else {
        const url = request.nextUrl.clone();
        url.pathname = '/login';
        url.search = `?next=${encodeURIComponent(path)}`;
        return NextResponse.redirect(url);
      }
    }
  }

  if (!path.startsWith('/api/')) reportPageView(request, event);

  return NextResponse.next();
}

export const config = {
  // API routes are included so the protected prefixes can be gated; static
  // assets and images stay out of the matcher for performance.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
