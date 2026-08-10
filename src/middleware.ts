import { NextResponse, type NextRequest } from 'next/server';

/**
 * Minimal middleware — ONLY used to expose the current pathname to
 * downstream server components (specifically RootLayout) so that the
 * maintenance-mode bypass for /admin works reliably.
 *
 * No auth logic, no rate-limit logic, no provider logic, no caching.
 * This file does NOT touch:
 *   - video fetching
 *   - provider race
 *   - download API
 *   - authentication
 *   - rate limiting
 *
 * The header `x-route-pathname` is set on every request and read by
 * src/app/layout.tsx to decide whether to render the maintenance page
 * or pass through to children. Without this header, the layout cannot
 * distinguish a direct navigation to /admin from a public page request.
 */
export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  // Forward the pathname as a REQUEST header so downstream server components
  // (RootLayout) can read it via `next/headers`. Setting it via
  // `NextResponse.next({ request: { headers: ... } })` mutates the request
  // before it reaches the page — this is the canonical Next.js pattern.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-route-pathname', pathname);
  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  // Run on all routes except static asset paths. This keeps middleware
  // overhead off of asset requests while still covering every page.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|favicon.png|icon-|apple-touch-icon|splash-|manifest.json|robots.txt|sitemap.xml).*)',
  ],
};
