import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';
import { middleware } from '@/middleware';
import { asyncHandler } from '@/lib/utils/errors';
import { clearAuthCookies, setAuthCookies, signSessionToken } from '@/lib/auth/session';
import { getVerifiedActor, requireAuthSession } from '@/lib/auth/guards';
import { makeRequestLike } from '../helpers/auth';

function makeMiddlewareReq(
  url: string,
  method = 'GET',
  headers: Record<string, string> = {},
  cookies: Record<string, string> = {},
) {
  const map = new Map<string, string>();
  for (const [key, value] of Object.entries(headers)) {
    map.set(key.toLowerCase(), value);
  }

  return {
    url,
    method,
    headers: {
      get: (key: string) => map.get(key.toLowerCase()) || null,
    },
    cookies: {
      get: (key: string) => {
        const value = cookies[key];
        return value ? { name: key, value } : undefined;
      },
    },
  } as any;
}

describe('Auth boundary hardening', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('treats forged development-secret sessions as unauthenticated in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('AUTH_SECRET', '');
    vi.stubEnv('NEXTAUTH_SECRET', '');
    vi.stubEnv('ADMIN_TOKEN', '');

    const token = signSessionToken({
      sub: 'admin-1',
      username: 'admin',
      displayName: 'Admin',
      role: 'ADMIN',
      forcePasswordChange: false,
      exp: Math.floor(Date.now() / 1000) + 60 * 60,
    }, 'development-auth-secret');

    const req = makeMiddlewareReq(
      'https://example.com/admin/dashboard',
      'GET',
      { host: 'example.com', 'x-forwarded-proto': 'https' },
      { auth_session: token },
    );

    const res = (await middleware(req)) as NextResponse;

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('https://example.com/login');
  });

  it('defaults auth cookies to Secure in production when COOKIE_SECURE is true', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('COOKIE_SECURE', 'true');
    vi.stubEnv('AUTH_SECRET', 'prod-secret');

    const setResponse = NextResponse.next();
    setAuthCookies(setResponse, {
      sub: 'admin-1',
      username: 'admin',
      displayName: 'Admin',
      role: 'ADMIN',
      forcePasswordChange: false,
      exp: Math.floor(Date.now() / 1000) + 60 * 60,
    });

    const clearResponse = NextResponse.next();
    clearAuthCookies(clearResponse);

    // Secure is only set when COOKIE_SECURE === 'true'
    expect(setResponse.headers.get('set-cookie') || '').toContain('Secure');
    expect(clearResponse.headers.get('set-cookie') || '').toContain('Secure');
  });

  it('blocks force-password-change sessions in explicit guard paths', () => {
    const req = makeRequestLike({
      url: 'http://localhost/api/payments',
      method: 'POST',
      role: 'ADMIN',
      sessionOverrides: { forcePasswordChange: true },
    });

    expect(() => getVerifiedActor(req as any)).toThrowError('Password change required');
  });

  it('allows change-password access while forcePasswordChange is active', () => {
    const req = makeRequestLike({
      url: 'http://localhost/api/auth/change-password',
      method: 'POST',
      role: 'ADMIN',
      sessionOverrides: { forcePasswordChange: true },
    });

    expect(() => requireAuthSession(req as any)).not.toThrow();
  });

  it('blocks force-password-change sessions in asyncHandler policy paths', async () => {
    const handler = asyncHandler(async () => NextResponse.json({ success: true }));
    const req = makeRequestLike({
      url: 'http://localhost/api/analytics/summary',
      method: 'GET',
      role: 'ADMIN',
      sessionOverrides: { forcePasswordChange: true },
    });

    const res = await handler(req as any);
    const body = await (res as Response).json();

    expect((res as Response).status).toBe(403);
    expect(body.error.message).toBe('Password change required');
  });

  it('keeps cron system actors available while password-change enforcement is active', () => {
    vi.stubEnv('CRON_SECRET', 'cron-secret');

    const req = makeRequestLike({
      url: 'http://localhost/api/system/backup/run',
      method: 'POST',
      headers: { 'x-cron-secret': 'cron-secret' },
    });

    const actor = getVerifiedActor(req as any, { allowSystem: true });

    expect(actor.isSystem).toBe(true);
    expect(actor.actorRole).toBe('SYSTEM');
  });
});
