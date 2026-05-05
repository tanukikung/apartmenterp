/**
 * Audit Integrity Cron Tests
 *
 * Covers Gap 8: Audit Runtime Integrity Enforcement
 *
 * TC-1: clean audit → verifyAuditChainIntegrity returns valid=true
 * TC-2: tampered event → verifyAuditChainIntegrity returns valid=false with broken event
 * TC-3: sequence gap → detects the gap
 * TC-4: cron job runs and logs correct result
 * TC-5: period close blocked when audit is broken
 *
 * NOTE: These tests use the real DATABASE via USE_PRISMA_TEST_DB flag.
 * They MUST run against a real PostgreSQL instance with audit chain triggers.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHash } from 'crypto';

// Use test database
process.env.USE_PRISMA_TEST_DB = 'true';

async function getPrisma() {
  const { prisma } = await import('@/lib/db/client');
  return prisma;
}

// ── Test fixtures ──────────────────────────────────────────────────────────────

/** Build a deterministic event hash given row fields */
function buildEventHash(row: {
  sequence_num: bigint;
  actor_id: string;
  actor_role: string;
  action: string;
  entity_type: string;
  entity_id: string;
  metadata: string | null;
  created_at: Date;
}): string {
  const content = [
    row.sequence_num.toString(),
    row.actor_id,
    row.actor_role,
    row.action,
    row.entity_type,
    row.entity_id,
    row.metadata ?? '',
    row.created_at.toISOString(),
  ].join('|');
  return createHash('sha256').update(content).digest('hex');
}

// ── Tests ───────────────────────────────────────────────────────────────────────

describe('verifyAuditChainIntegrity', () => {
  let prisma: Awaited<ReturnType<typeof getPrisma>>;

  beforeEach(async () => {
    prisma = await getPrisma();
  });

  afterEach(async () => {
    try { await prisma.auditLog.deleteMany({}); } catch { /* ignore */ }
  });

  // TC-1: clean audit → valid=true
  it('TC-1: returns valid=true on a clean audit chain with no events', async () => {
    await prisma.auditLog.deleteMany({});

    const { verifyAuditChainIntegrity } = await import('@/modules/audit/audit-integrity.service');
    const result = await verifyAuditChainIntegrity();

    expect(result.valid).toBe(true);
    expect(result.eventsChecked).toBe(0);
    expect(result.brokenEvents).toHaveLength(0);
    expect(result.gaps).toHaveLength(0);
  });

  it('TC-1: returns valid=true on a clean audit chain with sequential events', async () => {
    await prisma.auditLog.deleteMany({});

    const now = new Date();
    const GENESIS = '0'.repeat(64);

    // Insert 3 clean events
    const rows = [
      { seq: 1, actor: 'admin-1', role: 'ADMIN', action: 'LOGIN', entityType: 'User', entityId: 'u1' },
      { seq: 2, actor: 'admin-1', role: 'ADMIN', action: 'UPDATE_ROOM', entityType: 'Room', entityId: 'r1' },
      { seq: 3, actor: 'admin-2', role: 'ADMIN', action: 'CREATE_INVOICE', entityType: 'Invoice', entityId: 'inv1' },
    ];

    let prevHash = GENESIS;
    for (const r of rows) {
      const created = new Date(now.getTime() + r.seq * 1000);
      const eventHash = buildEventHash({
        sequence_num: BigInt(r.seq),
        actor_id: r.actor,
        actor_role: r.role,
        action: r.action,
        entity_type: r.entityType,
        entity_id: r.entityId,
        metadata: null,
        created_at: created,
      });

      await prisma.auditLog.create({
        data: {
          sequenceNum: BigInt(r.seq),
          userId: r.actor,
          userName: r.role,
          action: r.action,
          entityType: r.entityType,
          entityId: r.entityId,
          details: undefined,
          prevHash,
          eventHash,
          createdAt: created,
        },
      });
      prevHash = eventHash;
    }

    const { verifyAuditChainIntegrity } = await import('@/modules/audit/audit-integrity.service');
    const result = await verifyAuditChainIntegrity();

    expect(result.valid).toBe(true);
    expect(result.eventsChecked).toBe(3);
    expect(result.brokenEvents).toHaveLength(0);
    expect(result.gaps).toHaveLength(0);
  });

  // TC-2: tampered event → valid=false with broken event
  it('TC-2: detects a tampered eventHash and returns valid=false', async () => {
    await prisma.auditLog.deleteMany({});

    const now = new Date();
    const GENESIS = '0'.repeat(64);

    const event1Hash = buildEventHash({
      sequence_num: BigInt(1),
      actor_id: 'admin-1',
      actor_role: 'ADMIN',
      action: 'LOGIN',
      entity_type: 'User',
      entity_id: 'u1',
      metadata: null,
      created_at: now,
    });

    await prisma.auditLog.create({
      data: {
        sequenceNum: BigInt(1),
        userId: 'admin-1',
        userName: 'ADMIN',
        action: 'LOGIN',
        entityType: 'User',
        entityId: 'u1',
        details: undefined,
        prevHash: GENESIS,
        eventHash: event1Hash,
        createdAt: now,
      },
    });

    // Tampered second event (actor changed but eventHash is wrong)
    const tamperedHash = 'deadbeef' + '00'.repeat(28); // fake hash

    await prisma.auditLog.create({
      data: {
        sequenceNum: BigInt(2),
        userId: 'admin-2',
        userName: 'ADMIN',
        action: 'UPDATE_ROOM',
        entityType: 'Room',
        entityId: 'r1',
        details: undefined,
        prevHash: event1Hash,
        eventHash: tamperedHash, // intentionally wrong
        createdAt: new Date(now.getTime() + 1000),
      },
    });

    const { verifyAuditChainIntegrity } = await import('@/modules/audit/audit-integrity.service');
    const result = await verifyAuditChainIntegrity();

    expect(result.valid).toBe(false);
    expect(result.brokenEvents.length).toBeGreaterThan(0);
    expect(result.brokenEvents[0].sequenceNum).toBe('2');
    expect(result.brokenEvents[0].reason).toContain('eventHash mismatch');
  });

  // TC-3: sequence gap → detects the gap
  it('TC-3: detects a missing sequence number as a gap', async () => {
    await prisma.auditLog.deleteMany({});

    const now = new Date();
    const GENESIS = '0'.repeat(64);

    const event1Hash = buildEventHash({
      sequence_num: BigInt(1),
      actor_id: 'admin-1',
      actor_role: 'ADMIN',
      action: 'LOGIN',
      entity_type: 'User',
      entity_id: 'u1',
      metadata: null,
      created_at: now,
    });

    await prisma.auditLog.create({
      data: {
        sequenceNum: BigInt(1),
        userId: 'admin-1',
        userName: 'ADMIN',
        action: 'LOGIN',
        entityType: 'User',
        entityId: 'u1',
        details: undefined,
        prevHash: GENESIS,
        eventHash: event1Hash,
        createdAt: now,
      },
    });

    // Skip seq 2, insert seq 3 directly
    const event3Hash = buildEventHash({
      sequence_num: BigInt(3),
      actor_id: 'admin-1',
      actor_role: 'ADMIN',
      action: 'LOGOUT',
      entity_type: 'User',
      entity_id: 'u1',
      metadata: null,
      created_at: new Date(now.getTime() + 3000),
    });

    await prisma.auditLog.create({
      data: {
        sequenceNum: BigInt(3),
        userId: 'admin-1',
        userName: 'ADMIN',
        action: 'LOGOUT',
        entityType: 'User',
        entityId: 'u1',
        details: undefined,
        prevHash: event1Hash,
        eventHash: event3Hash,
        createdAt: new Date(now.getTime() + 3000),
      },
    });

    const { verifyAuditChainIntegrity } = await import('@/modules/audit/audit-integrity.service');
    const result = await verifyAuditChainIntegrity();

    expect(result.valid).toBe(false);
    expect(result.gaps.some((g) => g.missingSeqNum === '2')).toBe(true);
  });

  it('TC-3: detects a broken prevHash chain link', async () => {
    await prisma.auditLog.deleteMany({});

    const now = new Date();
    const GENESIS = '0'.repeat(64);

    const event1Hash = buildEventHash({
      sequence_num: BigInt(1),
      actor_id: 'admin-1',
      actor_role: 'ADMIN',
      action: 'LOGIN',
      entity_type: 'User',
      entity_id: 'u1',
      metadata: null,
      created_at: now,
    });

    await prisma.auditLog.create({
      data: {
        sequenceNum: BigInt(1),
        userId: 'admin-1',
        userName: 'ADMIN',
        action: 'LOGIN',
        entityType: 'User',
        entityId: 'u1',
        details: undefined,
        prevHash: GENESIS,
        eventHash: event1Hash,
        createdAt: now,
      },
    });

    // Seq 2 with correct prevHash but its own hash
    const event2Hash = buildEventHash({
      sequence_num: BigInt(2),
      actor_id: 'admin-1',
      actor_role: 'ADMIN',
      action: 'UPDATE_ROOM',
      entity_type: 'Room',
      entity_id: 'r1',
      metadata: null,
      created_at: new Date(now.getTime() + 1000),
    });

    await prisma.auditLog.create({
      data: {
        sequenceNum: BigInt(2),
        userId: 'admin-1',
        userName: 'ADMIN',
        action: 'UPDATE_ROOM',
        entityType: 'Room',
        entityId: 'r1',
        details: undefined,
        prevHash: event1Hash,
        eventHash: event2Hash,
        createdAt: new Date(now.getTime() + 1000),
      },
    });

    // Seq 3 has wrong prevHash (not event2Hash)
    const event3Hash = buildEventHash({
      sequence_num: BigInt(3),
      actor_id: 'admin-1',
      actor_role: 'ADMIN',
      action: 'LOGOUT',
      entity_type: 'User',
      entity_id: 'u1',
      metadata: null,
      created_at: new Date(now.getTime() + 3000),
    });

    await prisma.auditLog.create({
      data: {
        sequenceNum: BigInt(3),
        userId: 'admin-1',
        userName: 'ADMIN',
        action: 'LOGOUT',
        entityType: 'User',
        entityId: 'u1',
        details: undefined,
        prevHash: GENESIS, // wrong — should be event2Hash
        eventHash: event3Hash,
        createdAt: new Date(now.getTime() + 3000),
      },
    });

    const { verifyAuditChainIntegrity } = await import('@/modules/audit/audit-integrity.service');
    const result = await verifyAuditChainIntegrity();

    expect(result.valid).toBe(false);
    expect(result.brokenEvents.some((b) => b.sequenceNum === '3')).toBe(true);
  });
});

describe('Audit Integrity — Cron job integration', () => {
  let prisma: Awaited<ReturnType<typeof getPrisma>>;

  beforeEach(async () => {
    prisma = await getPrisma();
  });

  afterEach(async () => {
    try { await prisma.auditLog.deleteMany({}); } catch { /* ignore */ }
  });

  // TC-4: cron job runs and logs correct result
  it('TC-4: cron calls verifyAuditChainIntegrity and records metrics on success', async () => {
    await prisma.auditLog.deleteMany({});

    const { recordAuditIntegrityResult } = await import('@/lib/metrics/audit');
    const { verifyAuditChainIntegrity } = await import('@/modules/audit/audit-integrity.service');

    // Seed clean chain
    const now = new Date();
    const GENESIS = '0'.repeat(64);
    const event1Hash = buildEventHash({
      sequence_num: BigInt(1),
      actor_id: 'admin-1',
      actor_role: 'ADMIN',
      action: 'LOGIN',
      entity_type: 'User',
      entity_id: 'u1',
      metadata: null,
      created_at: now,
    });

    await prisma.auditLog.create({
      data: {
        sequenceNum: BigInt(1),
        userId: 'admin-1',
        userName: 'ADMIN',
        action: 'LOGIN',
        entityType: 'User',
        entityId: 'u1',
        details: undefined,
        prevHash: GENESIS,
        eventHash: event1Hash,
        createdAt: now,
      },
    });

    // Simulate what cron does
    const result = await verifyAuditChainIntegrity();
    recordAuditIntegrityResult(result, 'cron');

    expect(result.valid).toBe(true);
    expect(result.eventsChecked).toBe(1);

    // Check gauge was set to 1
    const { getSnapshot } = await import('@/lib/metrics/registry');
    const snap = getSnapshot();
    const integrityGauge = snap.gauges.find(
      (g) => g.name === 'audit_integrity_check' && (g.labels as Record<string,string>).check_type === 'cron'
    );
    expect(integrityGauge?.value).toBe(1);
  });

  it('TC-4: cron sets gauge to 0 when audit is broken', async () => {
    await prisma.auditLog.deleteMany({});

    // Insert tampered event
    const now = new Date();
    const GENESIS = '0'.repeat(64);
    const event1Hash = buildEventHash({
      sequence_num: BigInt(1),
      actor_id: 'admin-1',
      actor_role: 'ADMIN',
      action: 'LOGIN',
      entity_type: 'User',
      entity_id: 'u1',
      metadata: null,
      created_at: now,
    });

    await prisma.auditLog.create({
      data: {
        sequenceNum: BigInt(1),
        userId: 'admin-1',
        userName: 'ADMIN',
        action: 'LOGIN',
        entityType: 'User',
        entityId: 'u1',
        details: undefined,
        prevHash: GENESIS,
        eventHash: event1Hash,
        createdAt: now,
      },
    });

    await prisma.auditLog.create({
      data: {
        sequenceNum: BigInt(2),
        userId: 'admin-2',
        userName: 'ADMIN',
        action: 'UPDATE_ROOM',
        entityType: 'Room',
        entityId: 'r1',
        details: undefined,
        prevHash: event1Hash,
        eventHash: 'tampered' + '00'.repeat(28),
        createdAt: new Date(now.getTime() + 1000),
      },
    });

    const { recordAuditIntegrityResult } = await import('@/lib/metrics/audit');
    const { verifyAuditChainIntegrity } = await import('@/modules/audit/audit-integrity.service');

    const result = await verifyAuditChainIntegrity();
    recordAuditIntegrityResult(result, 'cron');

    expect(result.valid).toBe(false);
    expect(result.brokenEvents.length).toBeGreaterThan(0);

    const { getSnapshot } = await import('@/lib/metrics/registry');
    const snap = getSnapshot();
    const integrityGauge = snap.gauges.find(
      (g) => g.name === 'audit_integrity_check' && (g.labels as Record<string,string>).check_type === 'cron'
    );
    expect(integrityGauge?.value).toBe(0);
  });
});

// TC-5: period close blocked when audit is broken
describe('closeBillingPeriod — audit integrity gate', () => {
  let prisma: Awaited<ReturnType<typeof getPrisma>>;

  beforeEach(async () => {
    prisma = await getPrisma();
  });

  afterEach(async () => {
    // Must delete close events BEFORE billing periods due to RESTRICT FK
    // Clean up the fixed TC5-BP-1 and TC5-BP-2 period IDs used by TC-5 tests
    try {
      await prisma.billingPeriodCloseEvent.deleteMany({
        where: { periodId: { in: ['TC5-BP-1', 'TC5-BP-2'] } },
      });
    } catch { /* ignore */ }
    try {
      await prisma.billingPeriod.deleteMany({ where: { id: { in: ['TC5-BP-1', 'TC5-BP-2'] } } });
    } catch { /* ignore */ }
    // Also clean any (9998,8) and (9999,9) leftover by raw delete
    try {
      await prisma.$executeRaw`DELETE FROM billing_periods WHERE year = 9998 AND month = 8`;
    } catch { /* ignore */ }
    try {
      await prisma.$executeRaw`DELETE FROM billing_periods WHERE year = 9999 AND month = 9`;
    } catch { /* ignore */ }
    try { await prisma.auditLog.deleteMany({}); } catch { /* ignore */ }
  });

  it('TC-5: throws BadRequestError when audit chain is broken and period close is attempted', async () => {
    await prisma.auditLog.deleteMany({});

    // Set up a tampered audit chain
    const now = new Date();
    const GENESIS = '0'.repeat(64);
    const event1Hash = buildEventHash({
      sequence_num: BigInt(1),
      actor_id: 'admin-1',
      actor_role: 'ADMIN',
      action: 'LOGIN',
      entity_type: 'User',
      entity_id: 'u1',
      metadata: null,
      created_at: now,
    });

    await prisma.auditLog.create({
      data: {
        sequenceNum: BigInt(1),
        userId: 'admin-1',
        userName: 'ADMIN',
        action: 'LOGIN',
        entityType: 'User',
        entityId: 'u1',
        details: undefined,
        prevHash: GENESIS,
        eventHash: event1Hash,
        createdAt: now,
      },
    });

    // Insert seq 2 with wrong eventHash
    await prisma.auditLog.create({
      data: {
        sequenceNum: BigInt(2),
        userId: 'admin-2',
        userName: 'ADMIN',
        action: 'UPDATE_ROOM',
        entityType: 'Room',
        entityId: 'r1',
        details: undefined,
        prevHash: event1Hash,
        eventHash: 'ffff' + '00'.repeat(28),
        createdAt: new Date(now.getTime() + 1000),
      },
    });

    // Create an OPEN billing period to try to close
    // Use fixed IDs so afterEach can clean them deterministically
    // year=9998,month=8 is safe: no existing period in apartment_erp_test, no room_billings FK
    const periodId = `TC5-BP-1`;
    try {
      await prisma.billingPeriodCloseEvent.deleteMany({ where: { periodId } });
    } catch { /* ignore */ }
    try {
      await prisma.billingPeriod.deleteMany({ where: { id: periodId } });
    } catch { /* ignore */ }
    // Also clean any (9998,8) leftover by raw delete
    try {
      await prisma.$executeRaw`DELETE FROM billing_periods WHERE year = 9998 AND month = 8`;
    } catch { /* ignore */ }
    const period = await prisma.billingPeriod.upsert({
      where: { id: periodId },
      create: { id: periodId, year: 9998, month: 8, status: 'OPEN', version: 0 },
      update: {},
    });

    // Try to close it — should fail because audit is broken
    const { closeBillingPeriod } = await import('@/modules/billing/period-closing.service');

    await expect(
      closeBillingPeriod(prisma, period.id, 'admin-1', {})
    ).rejects.toThrow('audit chain integrity check failed');

    // Cleanup handled in afterEach
  });

  it('TC-5: successfully closes period when audit chain is clean', async () => {
    await prisma.auditLog.deleteMany({});

    // Clean audit chain
    const now = new Date();
    const GENESIS = '0'.repeat(64);
    const event1Hash = buildEventHash({
      sequence_num: BigInt(1),
      actor_id: 'admin-1',
      actor_role: 'ADMIN',
      action: 'LOGIN',
      entity_type: 'User',
      entity_id: 'u1',
      metadata: null,
      created_at: now,
    });

    await prisma.auditLog.create({
      data: {
        sequenceNum: BigInt(1),
        userId: 'admin-1',
        userName: 'ADMIN',
        action: 'LOGIN',
        entityType: 'User',
        entityId: 'u1',
        details: undefined,
        prevHash: GENESIS,
        eventHash: event1Hash,
        createdAt: now,
      },
    });

    // Create OPEN period
    // Use fixed ID so afterEach can clean deterministically
    // Use year=9999, month=9 to avoid colliding with ANY existing period in apartment_erp_test
    const periodId = `TC5-BP-2`;
    try {
      await prisma.billingPeriodCloseEvent.deleteMany({ where: { periodId } });
    } catch { /* ignore */ }
    try {
      await prisma.billingPeriod.deleteMany({ where: { id: periodId } });
    } catch { /* ignore */ }
    const period = await prisma.billingPeriod.upsert({
      where: { id: periodId },
      create: { id: periodId, year: 9999, month: 9, status: 'OPEN', version: 0 },
      update: {},
    });

    const { closeBillingPeriod } = await import('@/modules/billing/period-closing.service');

    const event = await closeBillingPeriod(prisma, period.id, 'admin-1', {});

    expect(event.periodId).toBe(period.id);
    expect(event.toStatus).toBe('CLOSED');

    // Cleanup handled in afterEach
  });
});
