// ============================================================================
// Idempotency middleware for write API routes.
//
// WHY: Payment and contract mutations must be safe to retry. If a client
// sends the same request twice (network timeout, retry logic) the server
// must return the original response rather than applying the operation again.
// Without this, a single payment slip could be recorded twice.
//
// PROTOCOL: Clients send `Idempotency-Key: <uuid>` on POST/PATCH/DELETE.
// The key is scoped to the resource type to prevent cross-resource collisions.
//
// RACE SAFETY: We attempt an optimistic INSERT before executing the handler.
// If two concurrent requests arrive with the same key, the unique constraint
// on `key` guarantees only one INSERT succeeds. The losing request finds the
// record in a "pending" state (result=null) and returns 409 — clients should
// retry after a brief delay. This is safer than letting both execute.
// ============================================================================

import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { logger } from './logger';
import { getSessionFromRequest } from '@/lib/auth/session';
import { inc as incCounter } from '@/lib/metrics/messaging';

export const IDEMPOTENCY_HEADER = 'Idempotency-Key';
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface StoredResult {
  statusCode: number;
  body: unknown;
}

/**
 * Require Idempotency-Key for all mutating requests.
 * Returns 422 if the header is missing on POST/PUT/PATCH/DELETE.
 * Key is scoped to (userId + method + path + idempotencyKey) to prevent:
 *   - Cross-user replay (user A retries user B's key)
 *   - Cross-endpoint collisions (same key used on different routes)
 *   - Cross-method collisions (same key used for POST vs PUT)
 * Response is cached and returned verbatim on retry.
 *
 * Safety properties:
 * - DB unique constraint on key → race condition safe
 * - result=null sentinel → concurrent requests get 409
 * - body hash mismatch → 409 Conflict on key reuse with different payload
 * - UserId binding → no cross-user replay possible
 */
export async function withIdempotency(
  req: NextRequest,
  resourceType: string,
  handler: () => Promise<NextResponse>,
): Promise<NextResponse> {
  const idempotencyKey = req.headers.get(IDEMPOTENCY_HEADER);

  // ── REQUIRE Idempotency-Key for all write methods ──────────────────────────
  const method = req.method?.toUpperCase() ?? 'GET';
  const isMutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
  if (isMutating && !idempotencyKey) {
    return NextResponse.json(
      {
        success: false,
        error: {
          message: 'Idempotency-Key header is required for all write operations. Provide a unique UUID per request.',
          code: 'IDEMPOTENCY_KEY_REQUIRED',
          name: 'ValidationError',
          statusCode: 422,
        },
      },
      { status: 422 },
    );
  }
  // GET/HEAD always proceed without idempotency
  if (!idempotencyKey) {
    return handler();
  }

  // ── Bind key to (userId + method + path + idempotencyKey) ──────────────────
  // Prevents cross-user replay and cross-endpoint collisions.
  // We extract userId from the session (bound to the authenticated user).
  const session = await getSessionFromRequest(req);
  const actorId = session?.sub ?? 'anonymous';
  const normalizedMethod = (req.method ?? 'GET').toUpperCase();
  // Use pathname from URL to scope the key to the specific endpoint
  let pathname = '/unknown';
  try {
    const url = new URL(req.url);
    pathname = url.pathname;
  } catch { /* use /unknown */ }

  // Key format: userId:method:path:idempotencyKey
  // This ensures:
  //   - User A cannot replay User B's key
  //   - Same key on POST /x and PUT /x are distinct
  //   - Same key on /a and /b are distinct
  const key = `${actorId}:${normalizedMethod}:${pathname}:${idempotencyKey}`;

  // Compute STRICT fingerprint: body + critical headers.
  // We clone the body text here so the handler can still read req.json().
  let requestBodyHash: string | null = null;
  try {
    const bodyText = await req.clone().text();
    if (bodyText) {
      const hasher = createHash('sha256');
      hasher.update(bodyText);
      // Include x-request-id if present (upstream trace identity)
      const requestId = req.headers.get('x-request-id');
      if (requestId) hasher.update(requestId);
      // Include content-type to differentiate JSON vs form-data vs binary
      const contentType = req.headers.get('content-type');
      if (contentType) hasher.update(contentType);
      requestBodyHash = hasher.digest('hex');
    }
  } catch {
    // Body unreadable — hash omitted; replay safety degrades gracefully
  }

  // Check for cached result first (fast path for retries)
  const existing = await prisma.idempotencyRecord.findUnique({
    where: { key },
    select: { response: true, requestBodyHash: true, createdAt: true },
  });

  if (existing) {
    if (existing.response === null) {
      // Record exists but has no result — another request is currently
      // processing. Return 409 so the client knows to retry.
      return NextResponse.json(
        { success: false, error: { message: 'A request with this Idempotency-Key is already in progress. Retry after a moment.', code: 'IDEMPOTENCY_IN_PROGRESS', name: 'ConflictError', statusCode: 409 } },
        { status: 409 },
      );
    }

    // Body-hash mismatch: same key, different payload — STRICT conflict.
    // This is a 409 Conflict (same category as IDEMPOTENCY_IN_PROGRESS) because
    // two different requests share the same idempotency key, which is a client bug.
    if (
      requestBodyHash !== null &&
      existing.requestBodyHash !== null &&
      existing.requestBodyHash !== requestBodyHash
    ) {
      logger.warn({ type: 'idempotency_conflict', key: idempotencyKey, existingHash: existing.requestBodyHash, newHash: requestBodyHash });
      incCounter('idempotency_conflict_total');
      return NextResponse.json(
        {
          success: false,
          error: {
            message: 'Idempotency-Key reused for a different request body. Generate a new key for each distinct operation.',
            code: 'IDEMPOTENCY_BODY_MISMATCH',
            name: 'ConflictError',
            statusCode: 409,
          },
        },
        { status: 409 },
      );
    }

    const stored = existing.response as unknown as StoredResult;
    logger.info({ type: 'idempotency_hit', resourceType, key: idempotencyKey });
    return NextResponse.json(stored.body, { status: stored.statusCode, headers: { 'Idempotency-Replayed': 'true' } });
  }

  // Optimistic insert — if a concurrent request races us here, the DB
  // unique constraint will reject the loser (caught below).
  try {
    await prisma.idempotencyRecord.create({
      data: {
        id: uuidv4(),
        key,
        resourceType,
        requestBodyHash,
        // result intentionally omitted — Prisma treats absent Json? as null in DB,
        // acting as an "in-progress" sentinel for concurrent request detection.
      },
    });
  } catch (err) {
    // Unique constraint violation — concurrent duplicate request
    if (isPrismaUniqueViolation(err)) {
      return NextResponse.json(
        { success: false, error: { message: 'A request with this Idempotency-Key is already in progress. Retry after a moment.', code: 'IDEMPOTENCY_IN_PROGRESS', name: 'ConflictError', statusCode: 409 } },
        { status: 409 },
      );
    }
    throw err;
  }

  // Execute the handler
  let response: NextResponse;
  try {
    response = await handler();
  } catch (err) {
    // Handler threw — delete the lock record so the client can retry
    await prisma.idempotencyRecord.delete({ where: { key } }).catch(() => {});
    throw err;
  }

  // Store result so retries get the same response
  const body = await extractBody(response);
  const stored: StoredResult = { statusCode: response.status, body };

  await prisma.idempotencyRecord.update({
    where: { key },
    data: {
      response: stored as object,
      resourceId: extractResourceId(body),
    },
  });

  // Prune records older than TTL (best-effort, non-blocking)
  const cutoff = new Date(Date.now() - IDEMPOTENCY_TTL_MS);
  prisma.idempotencyRecord
    .deleteMany({ where: { resourceType, createdAt: { lt: cutoff } } })
    .catch(() => {});

  logger.info({ type: 'idempotency_stored', resourceType, key: idempotencyKey, statusCode: response.status });
  return response;
}

function isPrismaUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

async function extractBody(response: NextResponse): Promise<unknown> {
  try {
    const cloned = response.clone();
    return await cloned.json();
  } catch {
    return null;
  }
}

function extractResourceId(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;
  if (typeof b.data === 'object' && b.data !== null) {
    const data = b.data as Record<string, unknown>;
    if (typeof data.id === 'string') return data.id;
    if (typeof data.payment === 'object' && data.payment !== null) {
      const p = data.payment as Record<string, unknown>;
      if (typeof p.id === 'string') return p.id;
    }
  }
  return null;
}
