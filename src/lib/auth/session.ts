import { createHmac, randomBytes, createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { AdminRole } from '@prisma/client';
import { getAuthSecret, resolveAuthSecret } from '@/lib/config/env';

export const AUTH_COOKIE_NAME = 'auth_session';
export const ROLE_COOKIE_NAME = 'role';

// WARNING: The session payload is base64-encoded JSON, NOT encrypted.
// The token is signed (HMAC-SHA256) to prevent tampering, but the payload is
// visible to anyone who can read the cookie. DO NOT store sensitive data
// (passwords, credit card numbers, personal identification numbers, etc.)
// in the session payload. Treat the payload as publicly visible.

// TODO [security/building-isolation]: Building isolation is NOT yet implemented at the API layer.
// All ADMIN/STAFF users can access all buildings' data regardless of buildingId.
// To enable building isolation:
// 1. Add a Building model to the schema with proper relations to Room, AdminUser, etc.
// 2. Ensure session.buildingId is set on login and checked in every API route.
// 3. Add buildingId filtering to all list queries (tenants, rooms, invoices, etc.).
// Currently buildingId in session is informational only - it is NOT enforced by any guard.
export interface AuthSessionPayload {
  sub: string;
  username: string;
  displayName: string;
  role: AdminRole;
  forcePasswordChange: boolean;
  buildingId: string | null; // Reserved for multi-building isolation (not yet enforced at API layer)
  exp: number;
  version?: number;
  lastLoginAt?: string;
}

function encodeBase64Url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function decodeBase64Url(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8');
}

export function signSessionToken(payload: AuthSessionPayload, secret = getAuthSecret()): string {
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = createHmac('sha256', secret).update(encodedPayload).digest('base64url');
  return `${encodedPayload}.${signature}`;
}

export function verifySessionToken(token: string, secret: string | null = resolveAuthSecret()): AuthSessionPayload | null {
  if (!secret) return null;
  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) return null;

  const expectedSignature = createHmac('sha256', secret).update(encodedPayload).digest('base64url');
  if (signature !== expectedSignature) return null;

  try {
    const payload = JSON.parse(decodeBase64Url(encodedPayload)) as AuthSessionPayload;
    if (!payload?.sub || !payload?.role || !payload?.exp || typeof payload.forcePasswordChange !== 'boolean') return null;
    if (typeof payload.buildingId !== 'string' && payload.buildingId !== null) return null;
    if (payload.exp * 1000 <= Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

// Sliding expiration: refresh session if valid and within the early refresh window.
// Returns the refreshed payload if renewed, otherwise returns null (no refresh needed or session invalid).
export function refreshSessionIfNeeded(payload: AuthSessionPayload, refreshBeforeSecs = 60 * 5): AuthSessionPayload | null {
  const nowMs = Date.now();
  const expMs = payload.exp * 1000;
  // Only refresh if: (a) not yet expired, and (b) expiring within the early refresh window
  if (expMs <= nowMs) return null;
  if (expMs - nowMs > refreshBeforeSecs * 1000) return null; // Not yet near expiry
  // Refresh: bump expiry by another 12 hours from now
  const refreshed: AuthSessionPayload = { ...payload, exp: Math.floor(nowMs / 1000) + 60 * 60 * 12 };
  return refreshed;
}

export function getSessionFromRequest(req: NextRequest): AuthSessionPayload | null {
  const cookieStore = (req as { cookies?: { get?: (name: string) => { value?: string } | undefined } }).cookies;
  if (!cookieStore || typeof cookieStore.get !== 'function') {
    return null;
  }
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export function setAuthCookies(res: NextResponse, payload: AuthSessionPayload): void {
  // SECURITY: COOKIE_SECURE must be explicitly set to 'true' when serving over HTTPS.
  // Never auto-enable based on NODE_ENV alone, as that can cause silent auth failures.
  const secure = process.env.COOKIE_SECURE === 'true';
  const token = signSessionToken(payload);

  res.cookies.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    expires: new Date(payload.exp * 1000),
  });

  res.cookies.set(ROLE_COOKIE_NAME, payload.role, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    expires: new Date(payload.exp * 1000),
  });
}

export function clearAuthCookies(res: NextResponse): void {
  // Same secure flag as setAuthCookies — must match to allow clearing the cookie
  const secure = process.env.COOKIE_SECURE === 'true';
  res.cookies.set(AUTH_COOKIE_NAME, '', { httpOnly: true, sameSite: 'lax', secure, path: '/', expires: new Date(0) });
  res.cookies.set(ROLE_COOKIE_NAME, '', { httpOnly: true, sameSite: 'lax', secure, path: '/', expires: new Date(0) });
}

export function createResetToken(): { rawToken: string; tokenHash: string } {
  const rawToken = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(rawToken).digest('hex');
  return { rawToken, tokenHash };
}

export function hashResetToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}
