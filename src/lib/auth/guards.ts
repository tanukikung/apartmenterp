import { NextRequest } from 'next/server';
import { AdminRole } from '@prisma/client';
import { getSessionFromRequest, refreshSessionIfNeeded, type AuthSessionPayload } from '@/lib/auth/session';
import { ForbiddenError, UnauthorizedError } from '@/lib/utils/errors';
import { hasValidCronSecret, isForcePasswordChangeExemptRoute } from '@/lib/auth/api-policy';

// Refresh threshold: if session expires within 5 minutes, refresh it
const REFRESH_THRESHOLD_SECS = 60 * 5;

export function requireAuthSession(req: NextRequest): AuthSessionPayload {
  const session = getSessionFromRequest(req);
  if (!session) {
    throw new UnauthorizedError('Authentication required');
  }
  // Sliding expiration: extend session if within 5-minute refresh window
  const refreshed = refreshSessionIfNeeded(session, REFRESH_THRESHOLD_SECS);
  if (refreshed) {
    // Cookie-setting requires a Response object — mark for refresh on the response side.
    // Guards do not have direct NextResponse access here; callers must handle the
    // X-Session-Refreshed header set by asyncHandler in errors.ts.
    (req as { _sessionRefreshed?: boolean })._sessionRefreshed = true;
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

/**
 * Validate that the session's buildingId matches the resource's buildingId.
 *
 * This is a fail-safe guard: when session.buildingId is null (single-building mode),
 * access is permitted for backward compatibility. When session.buildingId is set,
 * it must match the resourceBuildingId or a ForbiddenError is thrown.
 *
 * Usage in API routes:
 *   const session = requireOperator(req);
 *   const room = await prisma.room.findUnique({ where: { id } });
 *   requireBuildingAccess(session, room.buildingId);  // throws if mismatch
 *   // proceed with operation...
 *
 * @param session - The authenticated session (from requireOperator or requireAuthSession)
 * @param resourceBuildingId - The buildingId of the resource being accessed (null if unbuildinged)
 * @throws ForbiddenError - When session.buildingId is set but does not match resourceBuildingId
 */
export function requireBuildingAccess(
  session: AuthSessionPayload,
  resourceBuildingId: string | null
): void {
  if (session.buildingId === null) {
    // Single-building mode: no building isolation, permit all access
    return;
  }
  if (resourceBuildingId === null) {
    // Resource has no buildingId but session is building-scoped — deny to be safe
    throw new ForbiddenError('Access denied: resource belongs to a different building');
  }
  if (session.buildingId !== resourceBuildingId) {
    throw new ForbiddenError('Access denied: you do not have permission to access this building\'s data');
  }
}

export function getRequestIp(req: NextRequest): string | null {
  // Only trust x-forwarded-for when the direct connection is from a known proxy.
  const trustedProxies = (process.env.TRUSTED_PROXY_IPS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  // req.ip is set by Next.js when behind a proxy; fall back to x-forwarded-for
  const directIp = req.headers.get('x-real-ip') ?? null;
  if (directIp && trustedProxies.includes(directIp)) {
    const forwardedFor = req.headers.get('x-forwarded-for');
    if (forwardedFor) return forwardedFor.split(',')[0]?.trim() || null;
  }
  return directIp || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
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
