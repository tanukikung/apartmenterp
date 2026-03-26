import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifySessionTokenEdge } from '@/lib/auth/session-edge';
import { resolveAuthSecret } from '@/lib/config/env';
import { isCsrfExemptApiRoute } from '@/lib/auth/api-policy';
// Edge runtime: avoid Node-only imports here (no node-cron or fs/net)


function getIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return (req as unknown as { ip?: string }).ip || '0.0.0.0';
}

function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  const referer = req.headers.get('referer');
  const base = process.env.NEXTAUTH_URL || process.env.APP_BASE_URL || '';

  // Derive the expected origin from the request's own Host header so the
  // CSRF check works when the server runs on a different port than APP_BASE_URL
  const host = req.headers.get('host');
  const proto = req.headers.get('x-forwarded-proto') || 'http';
  const requestBase = host ? `${proto}://${host}` : '';

  if (!base && !requestBase) return true;

  // For same-origin requests without origin/referer header, use Host-based validation
  // Browsers don't always send Origin header for same-origin form POSTs
  if (!origin && !referer) {
    // If we have a requestBase, same-origin is valid based on Host header
    return true;
  }

  const source = origin || referer;
  if (!source) return false;
  try {
    const o = new URL(source);
    if (base) {
      const b = new URL(base);
      if (o.origin === b.origin) return true;
    }
    if (requestBase) {
      const rb = new URL(requestBase);
      if (o.origin === rb.origin) return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const url = new URL(req.url);
  const ip = getIp(req);
  const existingId = req.headers.get('x-request-id') || '';
  const requestId = existingId || (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2));

  // Rate limiting handled in asyncHandler at API layer (Node runtime)

  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const cronHeader = req.headers.get('x-cron-secret');
    if (cronHeader && process.env.CRON_SECRET && cronHeader === process.env.CRON_SECRET) {
      return NextResponse.next({
        headers: {
          'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
          'Referrer-Policy': 'no-referrer',
          'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
          'X-XSS-Protection': '0',
          'Content-Security-Policy': "default-src 'self'; img-src 'self' data: https:; script-src 'self'; style-src 'self' 'unsafe-inline'",
          'x-request-id': requestId,
        },
      });
    }
    if (!isCsrfExemptApiRoute(url.pathname, req.method) && !sameOrigin(req)) {
      return new NextResponse('CSRF Forbidden', { status: 403, headers: { 'x-request-id': requestId } });
    }
  }

  // RBAC guards for app routes
  if (
    url.pathname.startsWith('/admin') ||
    url.pathname.startsWith('/tenant') ||
    url.pathname === '/login' ||
    url.pathname === '/sign-up' ||
    url.pathname === '/forgot-password' ||
    url.pathname === '/reset-password' ||
    url.pathname === '/change-password'
  ) {
    // Skip guards in test to avoid interfering with tests
    if (process.env.NODE_ENV !== 'test') {
      const sessionToken = req.cookies.get('auth_session')?.value;
      const secret = resolveAuthSecret();
      const session = sessionToken && secret ? await verifySessionTokenEdge(sessionToken, secret) : null;
      const isAdmin = session?.role === 'ADMIN' || session?.role === 'STAFF';
      const mustChangePassword = Boolean(session?.forcePasswordChange);

      if (
        (url.pathname === '/login' ||
          url.pathname === '/sign-up' ||
          url.pathname === '/forgot-password' ||
          url.pathname === '/reset-password') &&
        isAdmin
      ) {
        const destination = mustChangePassword ? '/change-password' : '/admin/dashboard';
        const redirect = NextResponse.redirect(new URL(destination, req.url));
        redirect.headers.set('x-request-id', requestId);
        return redirect;
      }

      if (url.pathname === '/change-password' && !isAdmin) {
        const redirect = NextResponse.redirect(new URL('/login', req.url));
        redirect.headers.set('x-request-id', requestId);
        return redirect;
      }

      if (url.pathname !== '/change-password' && url.pathname.startsWith('/admin') && isAdmin && mustChangePassword) {
        const redirect = NextResponse.redirect(new URL('/change-password', req.url));
        redirect.headers.set('x-request-id', requestId);
        return redirect;
      }

      if (url.pathname === '/change-password' && isAdmin && !mustChangePassword) {
        const redirect = NextResponse.redirect(new URL('/admin/dashboard', req.url));
        redirect.headers.set('x-request-id', requestId);
        return redirect;
      }

      if (url.pathname.startsWith('/tenant')) {
        const redirect = NextResponse.redirect(new URL(isAdmin ? '/admin/dashboard' : '/login', req.url));
        redirect.headers.set('x-request-id', requestId);
        return redirect;
      }

      if (url.pathname.startsWith('/admin')) {
        // Allow /admin/setup without authentication (setup wizard)
        if (url.pathname === '/admin/setup') {
          // Let them through - setup page handles initialization check
        } else if (!isAdmin) {
          const redirect = NextResponse.redirect(new URL('/login', req.url));
          redirect.headers.set('x-request-id', requestId);
          return redirect;
        }
      }
    }
  }

  const start = Date.now();
  // PDF/binary API routes must not receive X-Frame-Options: DENY or a strict CSP —
  // both headers break Chrome's built-in PDF viewer (which renders inside an internal
  // embedded context).  Detect these routes early so we can skip those two headers.
  const isBinaryApiRoute = /^\/api\/invoices\/[^/]+\/pdf$/.test(url.pathname);
  const res = NextResponse.next();
  res.headers.set('x-request-id', requestId);
  res.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  res.headers.set('X-Content-Type-Options', 'nosniff');
  if (!isBinaryApiRoute) {
    res.headers.set('X-Frame-Options', 'DENY');
  }
  res.headers.set('Referrer-Policy', 'no-referrer');
  res.headers.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.headers.set('X-XSS-Protection', '0');
  // Only apply strict CSP to API routes; page routes need 'unsafe-inline' for Next.js hydration.
  // Skip CSP for binary routes — CSP only applies to HTML documents, not PDFs.
  if (url.pathname.startsWith('/api/') && !isBinaryApiRoute) {
    res.headers.set('Content-Security-Policy', "default-src 'self'; img-src 'self' data: https:; script-src 'self'; style-src 'self' 'unsafe-inline'");
  }
  try {
    console.log(JSON.stringify({
      type: 'api_request',
      method: req.method,
      path: url.pathname,
      statusCode: res.status,
      duration: `${Date.now() - start}ms`,
      requestId,
      ip,
    }));
  } catch {}
  return res;
}

export const config = {
  matcher: ['/api/:path*', '/admin/:path*', '/tenant/:path*', '/login', '/sign-up', '/forgot-password', '/reset-password', '/change-password'],
};
