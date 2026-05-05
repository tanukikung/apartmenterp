/**
 * Universal Version Guard — Concurrency Tests
 *
 * Integration tests verifying that version-based optimistic locking prevents
 * lost-update race conditions across BillingPeriod, RoomBilling, and Invoice.
 *
 * Run with: USE_PRISMA_TEST_DB=true npx vitest run tests/concurrency-universal.test.ts
 * Requires: DATABASE_URL pointing to a real PostgreSQL instance
 *
 * Key scenarios:
 * 1. Concurrent BillingPeriod updates → one succeeds, one gets ConcurrentModificationError
 * 2. Concurrent RoomBilling lock/unlock → lost update prevented
 * 3. Concurrent Invoice status transitions → one fails with ConcurrentModificationError
 * 4. versionedUpdate on non-existent record → throws NotFoundError
 * 5. versionedUpdate with wrong version → throws ConcurrentModificationError with accurate expected/actual versions
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PrismaClient, Prisma } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

process.env.USE_PRISMA_TEST_DB = 'true';

// Create a real PrismaClient directly — bypasses the module mock from setup-mocks.ts
function createRealPrisma(): PrismaClient {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL not set in concurrency-universal.test.ts');
  return new PrismaClient({ datasources: { db: { url: dbUrl } } });
}

let _realPrisma: PrismaClient | null = null;
function getPrisma(): PrismaClient {
  if (!_realPrisma) {
    _realPrisma = createRealPrisma();
  }
  return _realPrisma;
}

import { versionedUpdate, ConcurrentModificationError } from '@/lib/concurrency/version-guard';
import { ConflictError, NotFoundError } from '@/lib/utils/errors';

// Module-level counter for unique year/month per test to avoid constraint collisions
// Add a large random offset so that even if the module loads with counter=0,
// the starting values are in a range that doesn't collide with the hundreds of
// existing periods in apartment_erp_test (which have months derived from
// counter*7 and years up to ~5000).
let _testCounter = Math.floor(Math.random() * 200) + 100;

// ── Factory helpers ─────────────────────────────────────────────────────────

/**
 * Creates a minimal billing period. For full setup (with room + billing),
 * use createBillingPeriodWithRoom from concurrency-hardening.test.ts.
 *
 * Uses a per-run counter combined with UUID suffix to ensure no collisions
 * even across parallel test workers or slow sequential runs.
 */
async function createBillingPeriod(
  prisma: PrismaClient,
  year?: number,
  month?: number,
  status: string = 'OPEN',
): Promise<{ id: string; version: number }> {
  // Always advance counter to guarantee uniqueness — even when year/month are
  // explicitly passed (e.g., (2026, 5)). Without this, every test that calls
  // createBillingPeriod(prisma, 2026, 5, 'OPEN') creates the same (year,month)
  // and the second test run collides on the @@unique([year, month]) constraint.
  const uniqueMonth = (++_testCounter * 7) % 12 + 1;
  const uniqueYear = 2026 + Math.floor((_testCounter * 3) / 12);
  const id = `TPER-${_testCounter}-${uuidv4().slice(0, 8)}`;

  // Retry up to 3 times on P2002 (in case we collide with another test's period)
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const period = await prisma.billingPeriod.create({
        data: {
          id,
          year: uniqueYear + attempt,
          month: uniqueMonth,
          status: status as any,
          dueDay: 25,
          version: 0,
        },
      });
      return { id: period.id, version: period.version };
    } catch (err: unknown) {
      const prismaErr = err as { code?: string; meta?: { target?: string[] } };
      if (prismaErr.code === 'P2002' && attempt < 2) {
        // Try next year offset on retry
        continue;
      }
      if (prismaErr.code === 'P2002') {
        // Last resort: throw a clearer error
        throw new Error(`createBillingPeriod: failed after 3 attempts — P2002 on (year=${uniqueYear + attempt}, month=${uniqueMonth}). Use WIPE_TEST_DB=true to clean DB.`);
      }
      throw err;
    }
  }
  throw new Error('createBillingPeriod: unexpected exit');
}

// Store last created rule for fallback in roomBilling creation
let _lastRuleCode = 'test-rule';
let _lastAccId = 'test-acc';

async function createRoomBilling(
  prisma: PrismaClient,
  billingPeriodId: string,
  roomNo: string,
  status: string = 'DRAFT',
): Promise<{ id: string; version: number }> {
  const id = uuidv4();
  const rb = await prisma.roomBilling.create({
    data: {
      id,
      billingPeriodId,
      roomNo,
      status: status as any,
      recvAccountId: _lastAccId,
      ruleCode: _lastRuleCode,
      rentAmount: new Prisma.Decimal(5000),
      totalDue: new Prisma.Decimal(5000),
      waterMode: 'NORMAL',
      electricMode: 'NORMAL',
    },
  });
  return { id: rb.id, version: rb.version };
}

async function createInvoice(
  prisma: PrismaClient,
  roomBillingId: string,
  roomNo: string,
  year: number,
  month: number,
  status: string = 'GENERATED',
): Promise<{ id: string; version: number }> {
  const id = uuidv4();
  const inv = await prisma.invoice.create({
    data: {
      id,
      roomBillingId,
      roomNo,
      year,
      month,
      status: status as any,
      totalAmount: new Prisma.Decimal(5000),
      dueDate: new Date(year, month - 1, 25),
      version: 0, // start at 0 so concurrent updates both see version=0
    },
  });
  return { id: inv.id, version: inv.version };
}

async function createMinimalRoom(roomNo: string): Promise<{ accId: string; ruleCode: string }> {
  const prisma = await getPrisma();
  const accId = `test-acc-${uuidv4().slice(0, 8)}`;
  const ruleCode = `test-rule-${uuidv4().slice(0, 8)}`;
  _lastAccId = accId;
  _lastRuleCode = ruleCode;

  await prisma.bankAccount.create({
    data: { id: accId, name: 'Test', bankName: 'Test', bankAccountNo: '000', active: true },
  });
  await prisma.billingRule.create({
    data: {
      code: ruleCode,
      descriptionTh: 'Test',
      waterEnabled: false,
      waterUnitPrice: new Prisma.Decimal(0),
      waterMinCharge: new Prisma.Decimal(0),
      waterServiceFeeMode: 'NONE',
      waterServiceFeeAmount: new Prisma.Decimal(0),
      electricEnabled: false,
      electricUnitPrice: new Prisma.Decimal(0),
      electricMinCharge: new Prisma.Decimal(0),
      electricServiceFeeMode: 'NONE',
      electricServiceFeeAmount: new Prisma.Decimal(0),
    },
  });
  await prisma.room.create({
    data: {
      roomNo,
      floorNo: 1,
      defaultAccountId: accId,
      defaultRuleCode: ruleCode,
      defaultRentAmount: new Prisma.Decimal(5000),
      roomStatus: 'VACANT',
    } as any,
  });
  return { accId, ruleCode };
}

async function cleanupRoom(roomNo: string): Promise<void> {
  const prisma = await getPrisma();
  try {
    await prisma.room.deleteMany({ where: { roomNo } });
  } catch { /* ignore */ }
  try {
    await prisma.billingRule.deleteMany({ where: { code: { startsWith: 'test-rule' } } });
  } catch { /* ignore */ }
  try {
    await prisma.bankAccount.deleteMany({ where: { id: { startsWith: 'test-acc' } } });
  } catch { /* ignore */ }
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('versionedUpdate — strict concurrency enforcement', () => {
  let prisma: PrismaClient;

  beforeEach(async () => {
    prisma = await getPrisma();
  });

  afterEach(async () => {
    // Clean up by ID prefix (TPER-) which is the prefix used for test billing periods
    try { await prisma.roomBilling.deleteMany({ where: { roomNo: { startsWith: 'TEST-' } } }); } catch { /* ignore */ }
    try { await prisma.billingPeriod.deleteMany({ where: { id: { startsWith: 'TPER-' } } }); } catch { /* ignore */ }
    try { await prisma.invoice.deleteMany({ where: { roomNo: { startsWith: 'TEST-' } } }); } catch { /* ignore */ }
    try { await prisma.room.deleteMany({ where: { roomNo: { startsWith: 'TEST-' } } }); } catch { /* ignore */ }
  });

  describe('BillingPeriod concurrent update', () => {
    it('concurrent update: one MUST fail with ConcurrentModificationError', async () => {
      const period = await createBillingPeriod(prisma, 2026, 5, 'OPEN');

      const [r1, r2] = await Promise.allSettled([
        prisma.$transaction(async (tx) => {
          return versionedUpdate(tx, tx.billingPeriod,
            { id: period.id, version: 0 },
            { status: 'CLOSED' }
          );
        }),
        prisma.$transaction(async (tx) => {
          return versionedUpdate(tx, tx.billingPeriod,
            { id: period.id, version: 0 },
            { status: 'LOCKED' }
          );
        }),
      ]);

      const failures = [r1, r2].filter(r => r.status === 'rejected');
      const successes = [r1, r2].filter(r => r.status === 'fulfilled');

      expect(successes.length).toBe(1);
      expect(failures.length).toBe(1);

      const error = failures[0].reason as ConcurrentModificationError;
      expect(error).toBeInstanceOf(ConcurrentModificationError);
      expect(error.name).toBe('ConcurrentModificationError');
      expect(error.entityType).toBe('BillingPeriod');
      expect(error.expectedVersion).toBe(0);
      expect(error.actualVersion).toBe(1);
    });

    it('update with correct version succeeds', async () => {
      const period = await createBillingPeriod(prisma, 2026, 5, 'OPEN');

      const result = await prisma.$transaction(async (tx) => {
        return versionedUpdate(tx, tx.billingPeriod,
          { id: period.id, version: 0 },
          { status: 'CLOSED' }
        );
      });

      expect(result.status).toBe('CLOSED');
      expect(result.version).toBe(1);

      const result2 = await prisma.$transaction(async (tx) => {
        return versionedUpdate(tx, tx.billingPeriod,
          { id: period.id, version: 1 },
          { status: 'LOCKED' }
        );
      });

      expect(result2.status).toBe('LOCKED');
      expect(result2.version).toBe(2);
    });

    it('update with stale version throws ConcurrentModificationError with accurate info', async () => {
      const period = await createBillingPeriod(prisma, 2026, 5, 'OPEN');

      await prisma.$transaction(async (tx) => {
        return versionedUpdate(tx, tx.billingPeriod,
          { id: period.id, version: 0 },
          { status: 'CLOSED' }
        );
      });

      let thrownError: ConcurrentModificationError | null = null;
      try {
        await prisma.$transaction(async (tx) => {
          return versionedUpdate(tx, tx.billingPeriod,
            { id: period.id, version: 0 },
            { status: 'LOCKED' }
          );
        });
      } catch (err) {
        thrownError = err as ConcurrentModificationError;
      }

      expect(thrownError).not.toBeNull();
      expect(thrownError).toBeInstanceOf(ConcurrentModificationError);
      expect(thrownError!.expectedVersion).toBe(0);
      expect(thrownError!.actualVersion).toBe(1);
    });

    it('update on non-existent record throws NotFoundError', async () => {
      let thrownError: Error | null = null;
      try {
        await prisma.$transaction(async (tx) => {
          return versionedUpdate(tx, tx.billingPeriod,
            { id: 'non-existent-id', version: 0 },
            { status: 'CLOSED' }
          );
        });
      } catch (err) {
        thrownError = err as Error;
      }

      expect(thrownError).toBeInstanceOf(NotFoundError);
    });
  });

  describe('RoomBilling concurrent update', () => {
    it('concurrent lock attempts: one succeeds, one gets ConcurrentModificationError', async () => {
      const roomNo = `TEST-${uuidv4().slice(0, 8)}`;
      await createMinimalRoom(roomNo);

      try {
        const period = await createBillingPeriod(prisma, 2026, 5, 'OPEN');
        const billing = await createRoomBilling(prisma, period.id, roomNo, 'DRAFT');

        const [r1, r2] = await Promise.allSettled([
          prisma.$transaction(async (tx) => {
            return versionedUpdate(tx, tx.roomBilling,
              { id: billing.id, version: 0 },
              { status: 'LOCKED' }
            );
          }),
          prisma.$transaction(async (tx) => {
            return versionedUpdate(tx, tx.roomBilling,
              { id: billing.id, version: 0 },
              { status: 'LOCKED' }
            );
          }),
        ]);

        const failures = [r1, r2].filter(r => r.status === 'rejected');
        const successes = [r1, r2].filter(r => r.status === 'fulfilled');

        expect(successes.length).toBe(1);
        expect(failures.length).toBe(1);
        expect(failures[0].reason).toBeInstanceOf(ConcurrentModificationError);
      } finally {
        await cleanupRoom(roomNo);
      }
    });
  });

  describe('Invoice concurrent update', () => {
    it('concurrent cancel attempts: one succeeds, one gets ConcurrentModificationError', async () => {
      const roomNo = `TEST-${uuidv4().slice(0, 8)}`;
      await createMinimalRoom(roomNo);

      try {
        const period = await createBillingPeriod(prisma, 2026, 5, 'OPEN');
        const billing = await createRoomBilling(prisma, period.id, roomNo, 'LOCKED');
        const invoice = await createInvoice(prisma, billing.id, roomNo, 2026, 5, 'GENERATED');

        const [r1, r2] = await Promise.allSettled([
          prisma.$transaction(async (tx) => {
            return versionedUpdate(tx, tx.invoice,
              { id: invoice.id, version: 0 },
              {
                status: 'CANCELLED',
                cancelledAt: new Date(),
                cancelledBy: 'admin1',
                cancelReason: 'Test cancel 1',
              }
            );
          }),
          prisma.$transaction(async (tx) => {
            return versionedUpdate(tx, tx.invoice,
              { id: invoice.id, version: 0 },
              {
                status: 'CANCELLED',
                cancelledAt: new Date(),
                cancelledBy: 'admin2',
                cancelReason: 'Test cancel 2',
              }
            );
          }),
        ]);

        const failures = [r1, r2].filter(r => r.status === 'rejected');
        const successes = [r1, r2].filter(r => r.status === 'fulfilled');

        expect(successes.length).toBe(1);
        expect(failures.length).toBe(1);
        expect(failures[0].reason).toBeInstanceOf(ConcurrentModificationError);
      } finally {
        await cleanupRoom(roomNo);
      }
    });
  });

  describe('versionedUpdate edge cases', () => {
    it('correctly increments version on successful update', async () => {
      const period = await createBillingPeriod(prisma, 2026, 5, 'OPEN');

      const result = await prisma.$transaction(async (tx) => {
        return versionedUpdate(tx, tx.billingPeriod,
          { id: period.id, version: 0 },
          { status: 'CLOSED' }
        );
      });

      expect(result.version).toBe(1);

      const updated = await prisma.billingPeriod.findUnique({ where: { id: period.id } });
      expect(updated?.version).toBe(1);
      expect(updated?.status).toBe('CLOSED');
    });

    it('concurrent updates to different fields on same entity are serialized', async () => {
      const period = await createBillingPeriod(prisma, 2026, 5, 'OPEN');

      const [r1, r2] = await Promise.allSettled([
        prisma.$transaction(async (tx) => {
          return versionedUpdate(tx, tx.billingPeriod,
            { id: period.id, version: 0 },
            { status: 'CLOSED' }
          );
        }),
        prisma.$transaction(async (tx) => {
          return versionedUpdate(tx, tx.billingPeriod,
            { id: period.id, version: 0 },
            { note: 'updated by second tx' }
          );
        }),
      ]);

      const failures = [r1, r2].filter(r => r.status === 'rejected');
      const successes = [r1, r2].filter(r => r.status === 'fulfilled');
      expect(successes.length).toBe(1);
      expect(failures.length).toBe(1);
    });
  });
});

describe('ConcurrentModificationError — error properties', () => {
  it('error contains entityType, entityId, expectedVersion, actualVersion', () => {
    const error = new ConcurrentModificationError('BillingPeriod', 'test-id-123', 5, 7);

    expect(error.entityType).toBe('BillingPeriod');
    expect(error.entityId).toBe('test-id-123');
    expect(error.expectedVersion).toBe(5);
    expect(error.actualVersion).toBe(7);
    expect(error.code).toBe('CONFLICT');
    expect(error.statusCode).toBe(409);
    expect(error.message).toContain('Concurrent modification detected');
    expect(error.message).toContain('BillingPeriod');
    expect(error.message).toContain('test-id-123');
    expect(error.message).toContain('Expected version 5');
    expect(error.message).toContain('found 7');
  });

  it('extends ConflictError (HTTP 409)', () => {
    const error = new ConcurrentModificationError('Invoice', 'inv-456', 0, 1);
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ConflictError);
  });
});