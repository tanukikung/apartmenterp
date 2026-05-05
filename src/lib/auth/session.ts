import { randomBytes, createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { SignJWT, jwtVerify, JWTPayload } from 'jose';
import { AdminRole } from '@prisma/client';
import { getAuthSecret } from '@/lib/config/env';

export const AUTH_COOKIE_NAME = 'auth_session';
export const ROLE_COOKIE_NAME = 'role';

// WARNING: The session JWT payload is visible to anyone who can read the cookie.
// DO NOT store sensitive data (passwords, credit card numbers, personal identification
// numbers, etc.) in the session payload. Treat the payload as publicly visible.

// TODO [security/building-isolation]: Building isolation is NOT yet implemented at the API layer.
// All ADMIN/STAFF users can access all buildings' data regardless of buildingId.
// To enable building isolation:
// 1. Add a Building model to the schema with proper relations to Room, AdminUser, etc.
// 2. Ensure session.buildingId is set on login and checked in every API route.
// 3. Add buildingId filtering to all list queries (tenants, rooms, invoices, etc.).
// Currently buildingId in session is informational only - it is NOT enforced by any guard.

export interface AuthSessionPayload extends JWTPayload {
  sub: string;
  username: string;
  displayName: string;
  role: AdminRole;
  forcePasswordChange: boolean;
  buildingId: string | null; // Reserved for multi-building isolation (not yet enforced at API layer)
  version?: number;
  lastLoginAt?: string;
}

function getSecretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function signSessionToken(
  payload: Omit<AuthSessionPayload, 'iat' | 'exp' | 'iss' | 'sub'>,
  secret = getAuthSecret()
): Promise<string> {
  const token = await new SignJWT(payload as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .setSubject(payload.sub as string)
    .sign(getSecretKey(secret));
  return token;
}

export async function verifySessionToken(
  token: string,
  secret: string | null = getAuthSecret()
): Promise<AuthSessionPayload | null> {
  if (!secret) return null;
  try {
    const { payload } = await jwtVerify(token, getSecretKey(secret), {
      algorithms: ['HS256'],
    });
    const p = payload as AuthSessionPayload;
    if (!p?.sub || !p?.role || !p?.exp) return null;
    if (typeof p.forcePasswordChange !== 'boolean') return null;
    if (typeof p.buildingId !== 'string' && p.buildingId !== null) return null;
    return p;
  } catch {
    return null;
  }
}

// Sliding expiration: refresh session if valid and within the early refresh window.
// Returns the refreshed payload if renewed, otherwise returns null (no refresh needed or session invalid).
export async function refreshSessionIfNeeded(
  payload: AuthSessionPayload,
  secret = getAuthSecret(),
  refreshBeforeSecs = 60 * 5
): Promise<{ token: string; payload: AuthSessionPayload } | null> {
  const nowMs = Date.now();
  const expMs = (payload.exp as number) * 1000;
  if (expMs <= nowMs) return null;
  if (expMs - nowMs > refreshBeforeSecs * 1000) return null;
  // Refresh: re-sign with new expiry (12h from now)
  const refreshed: Omit<AuthSessionPayload, 'iat' | 'exp' | 'iss' | 'sub'> = {
    username: payload.username,
    displayName: payload.displayName,
    role: payload.role,
    forcePasswordChange: payload.forcePasswordChange,
    buildingId: payload.buildingId,
    version: payload.version,
    lastLoginAt: payload.lastLoginAt,
  };
  const newToken = await signSessionToken(refreshed, secret);
  return {
    token: newToken,
    payload: { ...payload, exp: Math.floor(nowMs / 1000) + 60 * 60 * 12 },
  };
}

export async function getSessionFromRequest(req: NextRequest): Promise<AuthSessionPayload | null> {
  const cookieStore = (req as { cookies?: { get?: (name: string) => { value?: string } | undefined } }).cookies;
  if (!cookieStore || typeof cookieStore.get !== 'function') return null;
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export async function setAuthCookies(
  res: NextResponse,
  payload: Omit<AuthSessionPayload, 'iat' | 'exp' | 'iss' | 'sub'>
): Promise<void> {
  const secure = process.env.COOKIE_SECURE === 'true';
  const token = await signSessionToken(payload);

  res.cookies.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  res.cookies.set(ROLE_COOKIE_NAME, payload.role as string, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });
}

export function clearAuthCookies(res: NextResponse): void {
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