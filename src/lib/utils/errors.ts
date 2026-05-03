import { ZodError } from 'zod';
// Avoid importing Prisma runtime types here to remain Edge-safe
import { NextResponse, type NextRequest } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { logger } from './logger';
import { redisRateLimit } from '@/infrastructure/redis';
import { mapPrismaError } from '@/lib/errors/prismaErrorMapper';
import { getSessionFromRequest, refreshSessionIfNeeded, type AuthSessionPayload } from '@/lib/auth/session';
import { hasValidCronSecret, resolveApiRoutePolicy, isForcePasswordChangeExemptRoute } from '@/lib/auth/api-policy';
import { runWithRequestContext, getRequestId } from '@/lib/context/request-context';

// ============================================================================
// Custom Error Classes
// ============================================================================

/**
 * Base application error
 */
export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: string = 'INTERNAL_ERROR',
    statusCode: number = 500,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = true;
    this.details = details;
    
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      ...(this.details && { details: this.details }),
    };
  }
}

/**
 * Bad Request Error (400)
 */
export class BadRequestError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'BAD_REQUEST', 400, details);
  }
}

/**
 * Data Integrity Violation Error (500)
 *
 * This error indicates a CRITICAL invariant was violated — a code bug, not a user error.
 * Examples:
 *   - PAID invoice without sufficient CONFIRMED payment
 *   - OCCUPIED room without ACTIVE contract
 *   - OVERDUE stored status with future dueDate
 *
 * This is not a 4xx because the client cannot fix it — it requires code/database fixes.
 */
export class DataIntegrityError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'DATA_INTEGRITY_VIOLATION', 500, details);
  }
}

/**
 * Unauthorized Error (401)
 */
export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 'UNAUTHORIZED', 401);
  }
}

/**
 * Forbidden Error (403)
 */
export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden') {
    super(message, 'FORBIDDEN', 403);
  }
}

/**
 * Not Found Error (404)
 */
export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    const message = id ? `${resource} with id ${id} not found` : `${resource} not found`;
    super(message, 'NOT_FOUND', 404);
  }
}

/**
 * Conflict Error (409)
 */
export class ConflictError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'CONFLICT', 409, details);
  }
}

/**
 * Gone Error (410)
 */
export class GoneError extends AppError {
  constructor(message: string = 'Resource gone') {
    super(message, 'GONE', 410);
  }
}

/**
 * Validation Error (422)
 */
export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', 422, details);
  }
}

/**
 * Rate Limit Error (429)
 */
export class RateLimitError extends AppError {
  constructor(message: string = 'Too many requests') {
    super(message, 'RATE_LIMIT_EXCEEDED', 429);
  }
}

/**
 * Database Error
 */
export class DatabaseError extends AppError {
  constructor(error: Error, context?: Record<string, unknown>) {
    super(
      'Database operation failed',
      'DATABASE_ERROR',
      500,
      { originalError: error.message, ...context }
    );
  }
}

/**
 * External Service Error
 */
export class ExternalServiceError extends AppError {
  constructor(service: string, error: Error) {
    super(
      `${service} service unavailable`,
      'EXTERNAL_SERVICE_ERROR',
      503,
      { service, originalError: error.message }
    );
  }
}

// ============================================================================
// Error Handler
// ============================================================================

export interface ErrorResponse {
  success: false;
  error: {
    name: string;
    message: string;
    code: string;
    statusCode: number;
    details?: Record<string, unknown>;
    requestId?: string;
  };
}

export interface SuccessResponse<T> {
  success: true;
  data: T;
}

export type ApiResponse<T> = SuccessResponse<T> | ErrorResponse;

/**
 * Format error for API response
 */
export function formatError(
  error: unknown,
  requestId?: string
): ErrorResponse {
  const resolvedRequestId = requestId ?? getRequestId();
  // Handle Zod validation errors
  if (error instanceof ZodError) {
    const details: Record<string, string[]> = {};
    error.errors.forEach((err) => {
      const path = err.path.join('.');
      if (!details[path]) {
        details[path] = [];
      }
      details[path].push(err.message);
    });

    return {
      success: false,
      error: {
        name: 'ValidationError',
        message: 'Invalid request data',
        code: 'VALIDATION_ERROR',
        statusCode: 422,
        details,
        requestId: resolvedRequestId,
      },
    };
  }

  // Handle Prisma KnownRequestError (P1xxx / P2xxx codes from the DB engine)
  if (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name: unknown }).name === 'PrismaClientKnownRequestError' &&
    'code' in error &&
    'message' in error
  ) {
    const e = error as { code: string; message: string };
    logger.error({ type: 'prisma_error', code: e.code, message: e.message });
    const mapped = mapPrismaError(e);
    if (mapped) {
      return {
        success: false,
        error: {
          name: 'DatabaseError',
          message: mapped.message,
          code: e.code,
          statusCode: mapped.status,
          requestId: resolvedRequestId,
        },
      };
    }

    return {
      success: false,
      error: {
        name: 'DatabaseError',
        message: 'Database operation failed',
        code: e.code,
        statusCode: 500,
        requestId: resolvedRequestId,
      },
    };
  }

  // Handle other Prisma error types that are not KnownRequestError:
  //   PrismaClientValidationError  – bad query (wrong field names / types)
  //   PrismaClientInitializationError – DB unreachable on cold start
  //   PrismaClientUnknownRequestError  – unrecognised DB error
  //   PrismaClientRustPanic           – Prisma engine internal panic
  if (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    typeof (error as { name: unknown }).name === 'string' &&
    (
      (error as { name: string }).name === 'PrismaClientValidationError' ||
      (error as { name: string }).name === 'PrismaClientInitializationError' ||
      (error as { name: string }).name === 'PrismaClientUnknownRequestError' ||
      (error as { name: string }).name === 'PrismaClientRustPanic'
    )
  ) {
    const e = error as { name: string; message: string };
    logger.error({ type: 'prisma_client_error', name: e.name, message: e.message, requestId: resolvedRequestId });
    // Never leak raw Prisma messages to clients — they can reveal schema,
    // field names, query structure. Always log server-side, return generic.
    return {
      success: false,
      error: {
        name: 'DatabaseError',
        message: 'Database operation failed',
        code: e.name,
        statusCode: 500,
        requestId: resolvedRequestId,
      },
    };
  }

  // Handle operational AppError
  if (error instanceof AppError) {
    return {
      success: false,
      error: {
        name: error.name,
        message: error.message,
        code: error.code,
        statusCode: error.statusCode,
        details: error.details,
        requestId: resolvedRequestId,
      },
    };
  }

  // Handle unknown errors — always return generic message to the client.
  // Full details (including stack) go to server logs only. Leaking stack
  // traces or raw error messages can reveal file paths, library names,
  // internal function names — useful to attackers.
  const unknownError = error as Error;
  logger.error({
    type: 'unhandled_error',
    name: unknownError.name,
    message: unknownError.message,
    stack: unknownError.stack,
    requestId: resolvedRequestId,
  });

  return {
    success: false,
    error: {
      name: 'InternalServerError',
      message: 'An unexpected error occurred',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
      requestId: resolvedRequestId,
    },
  };
}

/**
 * Safe JSON parse
 */
export function safeJSONParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

// Unified signature accepting both optional non-Promise and optional Promise params
export function asyncHandler<
  Params extends Record<string, string> = Record<string, string>,
>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: any,
): (req: NextRequest, ctx?: { params: Params }) => Promise<NextResponse> {
  return (async (...args: unknown[]): Promise<NextResponse | void> => {
    // Generate (or propagate) a request-scoped correlation ID.
    // Allows tracing a single request across all log lines.
    const [req] = args as [unknown, unknown?];
    const incomingRequestId =
      typeof (req as { headers?: { get?: (h: string) => string | null } })?.headers?.get === 'function'
        ? ((req as NextRequest).headers.get('x-request-id') ?? undefined)
        : undefined;
    const requestId = incomingRequestId ?? uuidv4();

    try {
      const [, resOrContext] = args as [unknown, unknown?];

      const isNextStyle =
        typeof req === 'object' &&
        req !== null &&
        ('headers' in req || 'url' in req || 'json' in req || 'text' in req);

      if (isNextStyle || typeof resOrContext === 'undefined') {
        const r = req as NextRequest;
        const requestUrl =
          typeof (req as { url?: unknown } | undefined)?.url === 'string'
            ? new URL((req as { url: string }).url)
            : null;

        let session: ReturnType<typeof getSessionFromRequest> = null;

        if (requestUrl) {
          const policy = resolveApiRoutePolicy(requestUrl.pathname, (r as { method?: string }).method || 'GET');
          if (policy && policy.accessClass !== 'public' && policy.accessClass !== 'custom') {
            if (policy.accessClass === 'system-or-operator' && hasValidCronSecret(r)) {
              return await runWithRequestContext({ requestId }, () =>
                (handler as (req: NextRequest, ctx?: { params: Params }) => Promise<NextResponse>)(r, resOrContext as { params: Params } | undefined)
              ).then(addRequestIdHeader(requestId));
            }

            session = getSessionFromRequest(r);
            if (!session) {
              throw new UnauthorizedError('Authentication required');
            }

            // Sliding expiration: if session is within 5-minute refresh window, mark it refreshed
            const refreshed = refreshSessionIfNeeded(session, 60 * 5);
            if (refreshed) {
              (r as { _sessionRefreshed?: AuthSessionPayload })._sessionRefreshed = refreshed;
            }

            if (
              session.forcePasswordChange &&
              !isForcePasswordChangeExemptRoute(requestUrl.pathname, (r as { method?: string }).method || 'GET')
            ) {
              throw new ForbiddenError('Password change required');
            }

            if (policy.accessClass === 'operator' || policy.accessClass === 'system-or-operator') {
              if (!['OWNER', 'ADMIN', 'STAFF'].includes(session.role)) {
                throw new ForbiddenError('Insufficient permissions');
              }
            }
          }
        }

        if (process.env.NODE_ENV !== 'test') {
          if (!requestUrl) {
            return await runWithRequestContext({ requestId, userId: session?.sub, sessionRole: session?.role }, () =>
              (handler as (req: NextRequest, ctx?: { params: Params }) => Promise<NextResponse>)(r, resOrContext as { params: Params } | undefined)
            ).then(addRequestIdHeader(requestId));
          }
          const xff = r.headers.get('x-forwarded-for');
          const ip = xff ? xff.split(',')[0].trim() : '0.0.0.0';
          const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000);
          const maxPerWindow = Number(process.env.RATE_LIMIT_MAX || 120);
          const limitWindowSeconds = Math.ceil(windowMs / 1000);
          const key = `${ip}:${requestUrl.pathname}`;
          // If Redis fails, block requests to prevent abuse (fail-closed for security)
          const count = await redisRateLimit(key, maxPerWindow, limitWindowSeconds).catch((err) => {
            logger.error({ type: 'rate_limit_redis_fail', key, error: err?.message });
            return maxPerWindow + 1; // block when Redis is down
          });
          if (count > maxPerWindow) {
            return NextResponse.json(
              { success: false, error: 'Too Many Requests' },
              { status: 429, headers: { 'X-Request-ID': requestId } }
            );
          }

          // ── Per-user rate limiting (separate key space from IP limiting) ────
          // Fails-CLOSED (blocks) on Redis failure — same policy as IP rate
          // limiting. A fail-open (.catch(() => 0)) would silently disable
          // per-user limits during Redis outages, defeating the protection.
          if (session) {
            const userKey = `user:${session.sub}:${requestUrl.pathname}`;
            const userMax = Number(process.env.RATE_LIMIT_USER_MAX ?? 60);
            const userCount = await redisRateLimit(userKey, userMax, limitWindowSeconds).catch((err) => {
              logger.error({ type: 'rate_limit_redis_fail', key: userKey, error: err?.message });
              return userMax + 1; // fail-closed: block when Redis is down
            });
            if (userCount > userMax) {
              return NextResponse.json(
                { success: false, error: 'Too Many Requests' },
                { status: 429, headers: { 'X-Request-ID': requestId } }
              );
            }
          }
        }
        // ── Request latency metrics ───────────────────────────────────────
        const startMs = Date.now();
        const method  = (r as { method?: string }).method ?? 'GET';
        const route   = requestUrl?.pathname ?? 'unknown';
        let statusCode = 200;
        try {
          const handlerResult = await runWithRequestContext(
            { requestId, userId: session?.sub, sessionRole: session?.role },
            () => (handler as (req: NextRequest, ctx?: { params: Params }) => Promise<NextResponse>)(r, resOrContext as { params: Params } | undefined)
          );
          statusCode = (handlerResult as NextResponse)?.status ?? 200;
          return addRequestIdHeader(requestId)(handlerResult);
        } finally {
          try {
            const { recordHttpRequest } = await import('@/lib/metrics/registry');
            recordHttpRequest(method, route, statusCode, (Date.now() - startMs) / 1000);
          } catch { /* metrics optional — never block the response */ }
        }
      }

      // Fallback for edge/custom server adapters — handler is typed as `any`
      // to support heterogeneous API shapes; safe because asyncHandler always
      // returns NextResponse|void.
      return await (handler as (req: unknown, ctx?: unknown) => Promise<NextResponse>)(req, args[1]);
    } catch (error) {
      const [, resOrContext] = args as [unknown, unknown?];

      if (resOrContext && typeof (resOrContext as { status?: unknown }).status === 'function') {
        const response = formatError(error, requestId);
        return (resOrContext as { status: (code: number) => { json: (body: ApiResponse<unknown>) => void } })
          .status(response.error.statusCode)
          .json(response);
      }

      const response = formatError(error, requestId);
      return NextResponse.json(response, {
        status: response.error.statusCode,
        headers: { 'X-Request-ID': requestId },
      });
    }
  }) as (req: NextRequest, ctx?: { params: Params }) => Promise<NextResponse>;
}

/** Attach X-Request-ID header to any NextResponse without changing its body/status. */
function addRequestIdHeader(requestId: string) {
  return (response: NextResponse): NextResponse => {
    response.headers.set('X-Request-ID', requestId);
    return response;
  };
}

/**
 * Check if error is operational (expected)
 */
export function isOperationalError(error: Error): boolean {
  if (error instanceof AppError) {
    return error.isOperational;
  }
  return false;
}
