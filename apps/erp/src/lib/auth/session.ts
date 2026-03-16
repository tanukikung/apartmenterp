import { createHmac, randomBytes, createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { AdminRole } from '@prisma/client';
import { getAuthSecret } from '@/lib/config/env';

export const AUTH_COOKIE_NAME = 'auth_session';
export const ROLE_COOKIE_NAME = 'role';

export interface AuthSessionPayload {
  sub: string;
  username: string;
  displayName: string;
  role: AdminRole;
  forcePasswordChange: boolean;
  exp: number;
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

export function verifySessionToken(token: string, secret = getAuthSecret()): AuthSessionPayload | null {
  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) return null;

  const expectedSignature = createHmac('sha256', secret).update(encodedPayload).digest('base64url');
  if (signature !== expectedSignature) return null;

  try {
    const payload = JSON.parse(decodeBase64Url(encodedPayload)) as AuthSessionPayload;
    if (!payload?.sub || !payload?.role || !payload?.exp || typeof payload.forcePasswordChange !== 'boolean') return null;
    if (payload.exp * 1000 <= Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function getSessionFromRequest(req: NextRequest): AuthSessionPayload | null {
  const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export function setAuthCookies(res: NextResponse, payload: AuthSessionPayload): void {
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
