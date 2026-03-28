import { NextRequest } from 'next/server';
import { AdminRole } from '@prisma/client';
import { getSessionFromRequest, type AuthSessionPayload } from '@/lib/auth/session';
import { ForbiddenError, UnauthorizedError } from '@/lib/utils/errors';
import { hasValidCronSecret, isForcePasswordChangeExemptRoute } from '@/lib/auth/api-policy';

export function requireAuthSession(req: NextRequest): AuthSessionPayload {
  const session = getSessionFromRequest(req);
  if (!session) {
    throw new UnauthorizedError('Authentication required');
  }
  const requestUrl = typeof (req as { url?: unknown }).url === 'string'
    ? new URL((req as { url: string }).url)
    : null;
  if (
    session.forcePasswordChange &&
    !isForcePasswordChangeExemptRoute(requestUrl?.pathname || '', req.method || 'GET')
  ) {
    throw new ForbiddenError('Password change required');
  }
  return session;
}

export function requireRole(
  req: NextRequest,
  roles: AdminRole[] = ['ADMIN', 'STAFF']
): AuthSessionPayload {
  const session = requireAuthSession(req);
  if (!roles.includes(session.role)) {
    throw new ForbiddenError('Insufficient permissions');
  }
  return session;
}

export function requireOperator(req: NextRequest): AuthSessionPayload {
  return requireRole(req, ['ADMIN', 'STAFF']);
}

export function getRequestIp(req: NextRequest): string | null {
  // Only trust x-forwarded-for when the direct connection is from a known proxy.
  const trustedProxies = (process.env.TRUSTED_PROXY_IPS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const directIp = (req as unknown as { ip?: string }).ip;
  if (directIp && trustedProxies.includes(directIp)) {
    const forwardedFor = req.headers.get('x-forwarded-for');
    if (forwardedFor) return forwardedFor.split(',')[0]?.trim() || null;
  }
  return directIp || null;
}

export interface VerifiedActor {
  actorId: string;
  actorRole: AdminRole | 'SYSTEM';
  ipAddress: string | null;
  isSystem: boolean;
  session: AuthSessionPayload | null;
}

export function getVerifiedActor(
  req: NextRequest,
  options?: {
    roles?: AdminRole[];
    allowSystem?: boolean;
    systemActorId?: string;
  }
): VerifiedActor {
  if (options?.allowSystem && hasValidCronSecret(req)) {
    return {
      actorId: options.systemActorId || 'system',
      actorRole: 'SYSTEM',
      ipAddress: getRequestIp(req),
      isSystem: true,
      session: null,
    };
  }

  const session = options?.roles ? requireRole(req, options.roles) : requireOperator(req);
  return {
    actorId: session.sub,
    actorRole: session.role,
    ipAddress: getRequestIp(req),
    isSystem: false,
    session,
  };
}
