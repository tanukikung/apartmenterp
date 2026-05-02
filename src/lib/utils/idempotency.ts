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

import { v4 as uuidv4 } from 'uuid';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { logger } from './logger';

export const IDEMPOTENCY_HEADER = 'Idempotency-Key';
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface StoredResult {
  statusCode: number;
  body: unknown;
}

/**
 * Wrap a write handler with idempotency.
 * If `Idempotency-Key` header is absent the request proceeds without caching
 * (non-breaking for existing clients, but clients SHOULD send the header).
 *
 * @param req          Incoming NextRequest
 * @param resourceType Namespace for the key (e.g. 'payment', 'contract_terminate')
 * @param handler      The actual route logic
 */
export async function withIdempotency(
  req: NextRequest,
  resourceType: string,
  handler: () => Promise<NextResponse>,
): Promise<NextResponse> {
  const idempotencyKey = req.headers.get(IDEMPOTENCY_HEADER);

  // If no key provided, execute without caching (backwards-compatible)
  if (!idempotencyKey) {
    return handler();
  }

  const key = `${resourceType}:${idempotencyKey}`;

  // Check for cached result first (fast path for retries)
  const existing = await prisma.idempotencyRecord.findUnique({
    where: { key },
    select: { result: true, createdAt: true },
  });

  if (existing) {
    if (existing.result === null) {
      // Record exists but has no result — another request is currently
      // processing. Return 409 so the client knows to retry.
      return NextResponse.json(
        { success: false, error: { message: 'A request with this Idempotency-Key is already in progress. Retry after a moment.', code: 'IDEMPOTENCY_IN_PROGRESS', name: 'ConflictError', statusCode: 409 } },
        { status: 409 },
      );
    }

    const stored = existing.result as unknown as StoredResult;
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
      result: stored as object,
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
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === 'P2002'
  );
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
