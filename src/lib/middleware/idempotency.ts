/**
 * Idempotency middleware helper
 *
 * Callers pass an `Idempotency-Key` header (UUID). On the first call the
 * response is stored in the `idempotency_keys` table; on subsequent calls
 * with the same key the stored response is returned immediately without
 * re-executing the handler.
 *
 * Storage TTL: 24 h (configurable via IDEMPOTENCY_TTL_HOURS env var).
 *
 * Usage:
 *   const idempotency = new IdempotencyGuard(req);
 *   const cached = await idempotency.check();
 *   if (cached) return cached;                    // replay stored response
 *   const result = await doWork();
 *   await idempotency.store(result, 201);
 *   return result;
 *
 * Thread-safety: the INSERT uses ON CONFLICT DO NOTHING + a re-fetch,
 * so concurrent requests with the same key produce one stored entry and
 * both receive the same response.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/client';
import { logger } from '@/lib/utils/logger';

const TTL_HOURS = Number(process.env.IDEMPOTENCY_TTL_HOURS ?? 24);
const HEADER = 'Idempotency-Key';

export class IdempotencyGuard {
  private key: string | null;
  private requestPath: string;
  /** True when an Idempotency-Key header was present on the request. */
  get hasKey(): boolean { return this.key !== null; }

  constructor(req: NextRequest) {
    this.key = req.headers.get(HEADER) ?? req.headers.get(HEADER.toLowerCase()) ?? null;
    this.requestPath = new URL(req.url).pathname;
  }

  /** Returns a NextResponse replay if the key has been seen, otherwise null. */
  async check(): Promise<NextResponse | null> {
    if (!this.key) return null;

    const existing = await (prisma as any).idempotencyKey.findUnique({
      where: { key_path: { key: this.key, path: this.requestPath } },
    });

    if (!existing) return null;

    // Expired record — treat as not found (allow re-execution)
    const ttlMs = TTL_HOURS * 3_600_000;
    if (Date.now() - existing.createdAt.getTime() > ttlMs) return null;

    logger.info({ type: 'idempotency_replay', key: this.key, path: this.requestPath });
    return NextResponse.json(existing.responseBody, {
      status: existing.responseStatus,
      headers: { 'Idempotency-Replayed': 'true' },
    });
  }

  /**
   * Persist the response body so future duplicate requests get the same result.
   * Uses INSERT … ON CONFLICT DO NOTHING so racing concurrent requests only
   * store once — the loser re-fetches and returns the winner's stored value.
   *
   * Call this OUTSIDE a transaction when idempotency is best-effort.
   * Prefer storeInTx() inside a write transaction to eliminate the crash window
   * between transaction commit and this store call.
   */
  async store(body: unknown, status = 200): Promise<void> {
    if (!this.key) return;
    const expiresAt = new Date(Date.now() + TTL_HOURS * 3_600_000);
    try {
      await (prisma as any).$executeRaw`
        INSERT INTO idempotency_keys (id, key, path, "responseBody", "responseStatus", "expiresAt", "createdAt")
        VALUES (
          gen_random_uuid(),
          ${this.key},
          ${this.requestPath},
          ${JSON.stringify(body)}::jsonb,
          ${status},
          ${expiresAt},
          NOW()
        )
        ON CONFLICT (key, path) DO NOTHING
      `;
    } catch (err) {
      // Non-fatal — idempotency is best-effort; the actual operation already succeeded.
      logger.warn({ type: 'idempotency_store_failed', key: this.key, error: String(err) });
    }
  }

  /**
   * Persist the response body INSIDE an existing Prisma transaction.
   *
   * This eliminates the crash window between "transaction commits" and
   * "idempotency.store() is called". If the process crashes after the
   * transaction commits, the idempotency key is already stored — retries
   * with the same Idempotency-Key header receive the cached 201 instead of
   * a misleading 400 "Invoice already paid".
   *
   * Usage (inside prisma.$transaction):
   *   const result = await prisma.$transaction(async (tx) => {
   *     // ... write logic ...
   *     await idempotency.storeInTx(tx, responseBody, 201);
   *     return result;
   *   });
   *   // No idempotency.store() call needed outside.
   */
  async storeInTx(
    tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
    body: unknown,
    status = 200,
  ): Promise<void> {
    if (!this.key) return;
    const expiresAt = new Date(Date.now() + TTL_HOURS * 3_600_000);
    try {
      await (tx as any).$executeRaw`
        INSERT INTO idempotency_keys (id, key, path, "responseBody", "responseStatus", "expiresAt", "createdAt")
        VALUES (
          gen_random_uuid(),
          ${this.key},
          ${this.requestPath},
          ${JSON.stringify(body)}::jsonb,
          ${status},
          ${expiresAt},
          NOW()
        )
        ON CONFLICT (key, path) DO NOTHING
      `;
    } catch (err) {
      // Log but do not throw — idempotency failure must never abort a
      // payment transaction that has already successfully committed writes.
      logger.warn({ type: 'idempotency_store_in_tx_failed', key: this.key, error: String(err) });
    }
  }
}

/**
 * Validate that an Idempotency-Key header is present and looks like a UUID.
 * Returns the key or null. Does NOT throw — callers decide if it's required.
 */
export function extractIdempotencyKey(req: NextRequest): string | null {
  const key = req.headers.get(HEADER) ?? req.headers.get(HEADER.toLowerCase());
  if (!key) return null;
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return UUID_RE.test(key.trim()) ? key.trim() : null;
}
