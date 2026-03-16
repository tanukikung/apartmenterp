import { NextRequest } from 'next/server';
import { AdminRole } from '@prisma/client';
import { getSessionFromRequest, type AuthSessionPayload } from '@/lib/auth/session';
import { ForbiddenError, UnauthorizedError } from '@/lib/utils/errors';

export function requireAuthSession(req: NextRequest): AuthSessionPayload {
  const session = getSessionFromRequest(req);
  if (!session) {
    throw new UnauthorizedError('Authentication required');
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

export function getRequestIp(req: NextRequest): string | null {
  const forwardedFor = req.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0]?.trim() || null;
  }
  return null;
}
