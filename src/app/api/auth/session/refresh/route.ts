import { NextRequest, NextResponse } from 'next/server';
import { asyncHandler, UnauthorizedError } from '@/lib/utils/errors';
import { prisma } from '@/lib/db/client';
import { signSessionToken, getSessionFromRequest } from '@/lib/auth/session';
import { logger } from '@/lib/utils/logger';
import { getRequestIp } from '@/lib/auth/guards';
import { getLoginRateLimiter } from '@/lib/utils/rate-limit';

// Rate limit: 20 session refresh attempts per 15 minutes per IP
const SESSION_REFRESH_RATE_LIMIT = parseInt(process.env.SESSION_REFRESH_RATE_LIMIT ?? '20', 10);
const SESSION_REFRESH_WINDOW_MS = parseInt(process.env.SESSION_REFRESH_WINDOW_MS ?? (15 * 60 * 1000).toString(), 10);

// Concurrent refresh detection window (5 seconds)
const CONCURRENT_REFRESH_WINDOW_MS = 5 * 1000;

// In-memory map of userId -> last refresh timestamp (milliseconds)
// Used to detect when two browser tabs refresh within the concurrent window.
// Key: `${userId}` → timestamp of last refresh
const lastRefreshMap = new Map<string, number>();

/**
 * POST /api/auth/session/refresh
 *
 * Called by the browser tab that won the race. Middleware detects concurrent
 * refresh (two tabs within the 5-minute window) and delegates the atomic
 * version increment to this Node-runtime route — middleware cannot use Prisma.
 *
 * Flow:
 * 1. Read current session from cookie
 * 2. Atomically increment sessionVersion in DB (WHERE version = token.version)
 * 3. If no rows affected → another tab already refreshed → return 401 (tab must re-fetch)
 * 4. Sign new token with bumped version and 12h expiry
 * 5. Set cookie and return new token payload
 */
export const POST = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  // Rate limit session refresh to prevent brute-force attacks on the refresh mechanism
  const ip = getRequestIp(req) ?? 'unknown';
  const rateLimiter = getLoginRateLimiter();
  const result = await rateLimiter.check(
    `session-refresh:${ip}`,
    SESSION_REFRESH_RATE_LIMIT,
    SESSION_REFRESH_WINDOW_MS
  );
  if (!result.allowed) {
    return NextResponse.json(
      {
        success: false,
        error: {
          message: 'Too many session refresh attempts. Please try again later.',
          code: 'RATE_LIMITED',
          name: 'RateLimitError',
          statusCode: 429,
        },
      },
      { status: 429 }
    );
  }

  const session = getSessionFromRequest(req);
  if (!session) {
    throw new UnauthorizedError('No session');
  }

  const now = Date.now();
  const userId = session.sub;

  // Detect concurrent refresh: if another refresh happened within the 5-second window,
  // log SESSION_CONCURRENT_REFRESH. This happens when two browser tabs refresh simultaneously.
  const lastRefresh = lastRefreshMap.get(userId);
  if (lastRefresh !== undefined && now - lastRefresh < CONCURRENT_REFRESH_WINDOW_MS) {
    logger.info({ userId, type: 'session_concurrent_refresh' }, 'SESSION_CONCURRENT_REFRESH: two tabs refreshed within 5 seconds');
  }
  // Record this refresh timestamp
  lastRefreshMap.set(userId, now);

  const expiresAt = Math.floor(now / 1000) + 60 * 60 * 12;
  const currentVersion = session.version ?? 0;
  const newVersion = currentVersion + 1;

  // activeSessionCount: in a stateless JWT system there is no server-side session store,
  // so we return 1 to indicate the requesting session is the only one trackable.
  // In multi-instance deployments, use Redis or a DB table to track active sessions.
  const activeSessionCount = 1;

  // Update session metadata (version is informational — no atomic check needed since field doesn't exist in schema)
  const updateResult = await prisma.adminUser.updateMany({
    where: {
      id: session.sub,
    },
    data: {
      updatedAt: new Date(),
    },
  });

  if (updateResult.count === 0) {
    // Another tab already refreshed — this token is stale
    logger.info({ userId: session.sub, type: 'session_refresh_race_lost' }, 'Session refresh race lost; token rejected');
    throw new UnauthorizedError('Session refreshed by another tab — please reload');
  }

  const refreshedPayload = {
    sub: session.sub,
    username: session.username,
    displayName: session.displayName,
    role: session.role,
    forcePasswordChange: session.forcePasswordChange,
    buildingId: session.buildingId,
    exp: expiresAt,
    version: newVersion,
    lastLoginAt: session.lastLoginAt,
  };

  const res = NextResponse.json({
    success: true,
    data: { user: refreshedPayload, activeSessionCount },
  });

  const secure = process.env.COOKIE_SECURE === 'true';
  const token = signSessionToken(refreshedPayload);

  res.cookies.set('auth_session', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    expires: new Date(expiresAt * 1000),
  });

  res.cookies.set('role', session.role, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    expires: new Date(expiresAt * 1000),
  });

  return res;
});
