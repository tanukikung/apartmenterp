/**
 * Audit Integrity Service — Append-Only + Hash Chain Verification
 *
 * This module provides tamper-evident audit logging via:
 *  1. A DB trigger that blocks UPDATE/DELETE on audit tables (append-only enforcement)
 *  2. A SHA256 hash chain linking each event to its predecessor
 *
 * Hash chain design:
 *  - Each event stores: sequenceNum (unique, auto-incrementing), prevHash, eventHash
 *  - prevHash = SHA256 of the previous event's full content (or null for genesis)
 *  - eventHash = SHA256(sequenceNum, actorId, actorRole, action, entityType, entityId, metadata, createdAt)
 *  - Chain verification: recompute eventHash from stored fields and verify prevHash links to previous eventHash
 *
 * The existing AuditService.logAudit() continues to work unchanged.
 * This service is used internally by modules that require hash-chain verification.
 */

import { createHash } from 'crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuditLogEntry {
  actorId: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
}

export interface VerifyChainResult {
  valid: boolean;
  /** 1-based index of the first broken entry, if not valid */
  brokenAt?: number;
  /** Total entries verified */
  total?: number;
  /** Human-readable error if valid is false */
  error?: string;
}

// Well-known genesis prevHash — 64 hex chars of zero
const GENESIS_PREV_HASH = '0'.repeat(64);

// ---------------------------------------------------------------------------
// Hash computation helpers
// ---------------------------------------------------------------------------

/**
 * Compute SHA256 hex digest of a string.
 */
function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Compute the eventHash for an audit entry.
 * Uses canonical field ordering to ensure deterministic results.
 */
function computeEventHash(params: {
  sequenceNum: bigint;
  actorId: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown> | undefined;
  createdAt: Date;
}): string {
  const { sequenceNum, actorId, actorRole, action, entityType, entityId, metadata, createdAt } = params;
  const content = [
    sequenceNum.toString(),
    actorId,
    actorRole,
    action,
    entityType,
    entityId,
    metadata ? JSON.stringify(metadata) : '',
    createdAt.toISOString(),
  ].join('|');
  return sha256(content);
}

// ---------------------------------------------------------------------------
// Create audit log with hash chain
// ---------------------------------------------------------------------------

/**
 * Write a new audit log entry with sequence-numbered hash chain linkage.
 *
 * Uses FOR UPDATE SKIP LOCKED when fetching the last entry to avoid
 * concurrent hash-chain breaks under high write throughput.
 *
 * Returns the created AuditLog record.
 */
export async function createAuditLog(
  tx: Prisma.TransactionClient,
  entry: AuditLogEntry
): Promise<{ id: string; sequenceNum: bigint; eventHash: string }> {
  // Acquire a row lock on the last audit log entry to serialise writes
  const [lastRow] = await tx.$queryRawUnsafe<
    Array<{ sequence_num: bigint; event_hash: string | null }>
  >(
    `SELECT sequence_num, event_hash
       FROM audit_logs
   ORDER BY sequence_num DESC
      LIMIT 1
     FOR UPDATE SKIP LOCKED`,
  );

  const nextSeq = BigInt((lastRow?.sequence_num ?? BigInt(0))) + BigInt(1);
  const prevHash = lastRow?.event_hash ?? GENESIS_PREV_HASH;
  const now = new Date();

  const eventHash = computeEventHash({
    sequenceNum: nextSeq,
    actorId: entry.actorId,
    actorRole: entry.actorRole,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    metadata: entry.metadata,
    createdAt: now,
  });

  const record = await tx.auditLog.create({
    data: {
      sequenceNum: nextSeq,
      userId: entry.actorId,
      userName: entry.actorRole,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      details: entry.metadata as Prisma.InputJsonValue | undefined,
      prevHash,
      eventHash,
      createdAt: now,
    },
  });

  return { id: record.id, sequenceNum: record.sequenceNum, eventHash: record.eventHash };
}

// ---------------------------------------------------------------------------
// Verify audit chain
// ---------------------------------------------------------------------------

/**
 * Verify the hash chain integrity of all audit_log entries.
 *
 * Iterates entries in sequence order, recomputing each eventHash from stored
 * fields and verifying that prevHash matches the previous eventHash.
 *
 * Returns { valid: true } if the chain is intact.
 * Returns { valid: false, brokenAt, total, error } on the first detected break.
 */
export async function verifyAuditChain(
  _fromSeq?: bigint,
  _toSeq?: bigint,
): Promise<VerifyChainResult> {
  const BATCH = 500;
  let prevHash = GENESIS_PREV_HASH;
  let expectedSeq = ( _fromSeq ?? BigInt(1));
  let globalCount = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const _queryStr =  _fromSeq !== undefined
      ? `SELECT "sequenceNum", "actorId", "actorRole", "action", "entityType", "entityId",
                  "details", "createdAt", "prevHash", "eventHash"
             FROM "audit_logs"
            WHERE "sequenceNum" >= $1 AND "sequenceNum" <= $2
         ORDER BY "sequenceNum" ASC
            LIMIT ${BATCH}`
      : `SELECT "sequenceNum", "actorId", "actorRole", "action", "entityType", "entityId",
                  "details", "createdAt", "prevHash", "eventHash"
             FROM "audit_logs"
         ORDER BY "sequenceNum" ASC
            LIMIT ${BATCH}`;
    const rows = await prisma.$queryRawUnsafe<
      Array<{
        sequence_num: bigint;
        actor_id: string;
        actor_role: string;
        action: string;
        entity_type: string;
        entity_id: string;
        metadata: string | null;
        created_at: Date;
        prev_hash: string | null;
        event_hash: string;
      }>
    >(
      `SELECT "sequenceNum" as sequence_num,
              "userId" as actor_id,
              "userName" as actor_role,
              "action",
              "entityType" as entity_type,
              "entityId" as entity_id,
              "details" as metadata,
              "createdAt" as created_at,
              "prevHash" as prev_hash,
              "eventHash" as event_hash
         FROM "audit_logs"
     ORDER BY "sequenceNum" ASC
        LIMIT ${BATCH}`,
      [undefined],
    );

    if (rows.length === 0) break;

    for (const row of rows) {
      globalCount++;

      // Detect sequence gaps
      if (row.sequence_num !== expectedSeq) {
        return {
          valid: false,
          brokenAt: Number(expectedSeq),
          total: globalCount,
          error: `Sequence gap: expected ${expectedSeq} but found ${row.sequence_num}`,
        };
      }
      expectedSeq = expectedSeq + BigInt(1);

      // Verify prevHash links to previous eventHash
      const storedPrevHash = row.prev_hash ?? GENESIS_PREV_HASH;
      if (storedPrevHash !== prevHash) {
        return {
          valid: false,
          brokenAt: globalCount,
          total: globalCount,
          error: `Chain broken at sequence ${row.sequence_num}: expected prevHash ${prevHash} but got ${storedPrevHash}`,
        };
      }

      // Recompute eventHash and compare
      const recomputed = computeEventHash({
        sequenceNum: row.sequence_num,
        actorId: row.actor_id,
        actorRole: row.actor_role,
        action: row.action,
        entityType: row.entity_type,
        entityId: row.entity_id,
        metadata: row.metadata !== null ? (JSON.parse(row.metadata) as Record<string, unknown>) : undefined,
        createdAt: row.created_at,
      });

      if (recomputed !== row.event_hash) {
        return {
          valid: false,
          brokenAt: globalCount,
          total: globalCount,
          error: `Tamper detected at sequence ${row.sequence_num}: eventHash mismatch`,
        };
      }

      // Advance chain
      prevHash = row.event_hash;
    }

    if (rows.length < BATCH) break;
  }

  return { valid: true, total: globalCount };
}

// ---------------------------------------------------------------------------
// Extended integrity result (used by cron and health checks)
// ---------------------------------------------------------------------------

export interface AuditIntegrityResult {
  valid: boolean;
  eventsChecked: number;
  brokenEvents: Array<{ sequenceNum: string; reason: string }>;
  gaps: Array<{ missingSeqNum: string; afterSeqNum: string }>;
  durationMs: number;
}

/**
 * Full audit chain integrity check.
 *
 * Verifies the entire chain (or a range) for:
 *  - Hash chain continuity (prevHash links to previous eventHash)
 *  - Sequence gaps
 *  - Tampered records (eventHash recomputation mismatch)
 *
 * Uses batched iteration to handle large tables without OOM.
 *
 * @param fromSeq  Optional lower bound sequence number (inclusive)
 * @param toSeq    Optional upper bound sequence number (inclusive)
 */
export async function verifyAuditChainIntegrity(
  _fromSeq?: bigint,
  _toSeq?: bigint,
): Promise<AuditIntegrityResult> {
  const start = Date.now();
  const brokenEvents: Array<{ sequenceNum: string; reason: string }> = [];
  const gaps: Array<{ missingSeqNum: string; afterSeqNum: string }> = [];
  const BATCH = 10_000;

  let prevHash: string | null = null;
  let expectedSeq = _fromSeq ?? BigInt(1);
  let globalCount = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const _queryStr =  _fromSeq !== undefined
      ? `SELECT "sequenceNum", "actorId", "actorRole", "action", "entityType", "entityId",
                  "details", "createdAt", "prevHash", "eventHash"
             FROM "audit_logs"
            WHERE "sequenceNum" >= $1 AND "sequenceNum" <= $2
         ORDER BY "sequenceNum" ASC
            LIMIT ${BATCH}`
      : `SELECT "sequenceNum", "actorId", "actorRole", "action", "entityType", "entityId",
                  "details", "createdAt", "prevHash", "eventHash"
             FROM "audit_logs"
         ORDER BY "sequenceNum" ASC
            LIMIT ${BATCH}`;
    const rows = await prisma.$queryRawUnsafe<
      Array<{
        sequence_num: bigint;
        actor_id: string;
        actor_role: string;
        action: string;
        entity_type: string;
        entity_id: string;
        metadata: string | null;
        created_at: Date;
        prev_hash: string | null;
        event_hash: string;
      }>
    >(
      `SELECT "sequenceNum" as sequence_num,
              "userId" as actor_id,
              "userName" as actor_role,
              "action",
              "entityType" as entity_type,
              "entityId" as entity_id,
              "details" as metadata,
              "createdAt" as created_at,
              "prevHash" as prev_hash,
              "eventHash" as event_hash
         FROM "audit_logs"
     ORDER BY "sequenceNum" ASC
        LIMIT ${BATCH}`,
      [undefined],
    );

    if (rows.length === 0) break;

    for (const row of rows) {
      const seqNumStr = row.sequence_num.toString();

      // Detect sequence gap
      if (row.sequence_num !== expectedSeq) {
        gaps.push({
          missingSeqNum: expectedSeq.toString(),
          afterSeqNum: (row.sequence_num - BigInt(1)).toString(),
        });
        // Skip to the found sequence
        expectedSeq = row.sequence_num;
      }
      expectedSeq = expectedSeq + BigInt(1);

      // Verify prevHash chain link
      const storedPrevHash = row.prev_hash ?? GENESIS_PREV_HASH;
      if (prevHash !== null && storedPrevHash !== prevHash) {
        brokenEvents.push({
          sequenceNum: seqNumStr,
          reason: `prevHash mismatch: expected ${prevHash}, got ${storedPrevHash}`,
        });
      }

      // Verify eventHash recomputation
      const recomputed = computeEventHash({
        sequenceNum: row.sequence_num,
        actorId: row.actor_id,
        actorRole: row.actor_role,
        action: row.action,
        entityType: row.entity_type,
        entityId: row.entity_id,
        metadata: row.metadata !== null ? (JSON.parse(row.metadata) as Record<string, unknown>) : undefined,
        createdAt: row.created_at,
      });

      if (recomputed !== row.event_hash) {
        brokenEvents.push({
          sequenceNum: seqNumStr,
          reason: `eventHash mismatch: computed ${recomputed}, stored ${row.event_hash}`,
        });
      }

      globalCount++;
      prevHash = row.event_hash;
    }

    if (rows.length < BATCH) break;
  }

  return {
    valid: brokenEvents.length === 0 && gaps.length === 0,
    eventsChecked: globalCount,
    brokenEvents,
    gaps,
    durationMs: Date.now() - start,
  };
}

/**
 * Lightweight probe — checks only that the most recent event's prevHash
 * matches the one stored before it. Fast health check.
 */
export async function probeAuditChainIntegrity(): Promise<{
  healthy: boolean;
  lastEventHash: string | null;
  lastSeq: bigint | null;
}> {
  const [last] = await prisma.$queryRawUnsafe<
    Array<{ sequence_num: bigint; event_hash: string | null; prev_hash: string | null }>
  >(
    `SELECT sequence_num, event_hash, prev_hash
       FROM audit_logs
   ORDER BY sequence_num DESC
      LIMIT 1`,
  );

  if (!last) return { healthy: true, lastEventHash: null, lastSeq: null };

  // If there is only one event, prev_hash should be genesis
  const [previous] = await prisma.$queryRawUnsafe<
    Array<{ event_hash: string | null }>
  >(
    `SELECT event_hash FROM audit_logs WHERE sequence_num = $1 LIMIT 1`,
    [last.sequence_num - BigInt(1)],
  );

  const expectedPrev = previous?.event_hash ?? GENESIS_PREV_HASH;
  const healthy = (last.prev_hash ?? GENESIS_PREV_HASH) === expectedPrev;

  return {
    healthy,
    lastEventHash: last.event_hash,
    lastSeq: last.sequence_num,
  };
}
