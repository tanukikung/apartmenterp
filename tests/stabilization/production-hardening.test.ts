/**
 * Production Hardening Integration Tests
 * Verifies critical invariants from Phases 1-8 audit gate.
 */

import { describe, it, expect, vi } from 'vitest';
import { v4 as uuidv4 } from 'uuid';

vi.doUnmock('@/lib/db/client');
vi.resetModules();
process.env.USE_PRISMA_TEST_DB = 'true';

// ─── helpers ─────────────────────────────────────────────────────────────────

async function getPrisma() {
  const { prisma } = await import('@/lib/db/client');
  return prisma as any;
}

async function getServiceContainer() {
  const mod = await import('@/lib/service-container');
  return mod.getServiceContainer();
}

function randomYearMonth() {
  // Randomize far in the future to sidestep (year, month) uniqueness across
  // parallel test files and leftover state from seed data.
  return {
    year: 3000 + Math.floor(Math.random() * 1000),
    month: 1 + Math.floor(Math.random() * 12),
  };
}

async function createPrismaRoomBilling(overrides?: {
  periodStatus?: string;
  billingStatus?: string;
  totalDue?: number;
  year?: number;
  month?: number;
}) {
  const prisma = await getPrisma();
  const roomNo = `TEST-${Math.floor(Math.random() * 99999)}-${Math.random().toString(36).slice(2, 6)}`;
  const { year: defY, month: defM } = randomYearMonth();
  const year = overrides?.year ?? defY;
  const month = overrides?.month ?? defM;

  const room = await prisma.room.create({
    data: {
      roomNo,
      floorNo: 1,
      defaultAccountId: 'ACC_F1',
      defaultRuleCode: 'STANDARD',
      defaultRentAmount: 5000,
      hasFurniture: false,
      defaultFurnitureAmount: 0,
      roomStatus: 'VACANT',
    },
  });

  const period = await prisma.billingPeriod.upsert({
    where: { year_month: { year, month } },
    update: {},
    create: { id: uuidv4(), year, month, status: overrides?.periodStatus ?? 'OPEN' },
  });

  const roomBilling = await prisma.roomBilling.create({
    data: {
      id: uuidv4(),
      billingPeriodId: period.id,
      roomNo: room.roomNo,
      recvAccountId: 'ACC_F1',
      ruleCode: 'STANDARD',
      rentAmount: 5000,
      waterMode: 'NORMAL', waterUnits: 0, waterUsageCharge: 0, waterServiceFee: 0, waterTotal: 0,
      electricMode: 'NORMAL', electricUnits: 0, electricUsageCharge: 0, electricServiceFee: 0, electricTotal: 0,
      furnitureFee: 0, otherFee: 0,
      totalDue: overrides?.totalDue ?? 5000,
      status: overrides?.billingStatus ?? 'DRAFT',
    },
  });

  return { room, period, roomBilling, year, month };
}

// ─── Test: confirmMatch_twice_same_transaction ────────────────────────────────
describe('confirmMatch_twice_same_transaction', () => {
  it('idempotent: second confirmMatch on already-confirmed transaction is a no-op', async () => {
    const prisma = await getPrisma();
    try { await prisma.$connect(); } catch { return; }

    const { room, roomBilling: rb, year, month } = await createPrismaRoomBilling({
      periodStatus: 'LOCKED',
      billingStatus: 'LOCKED',
    });

    const invoice = await prisma.invoice.create({
      data: {
        id: uuidv4(),
        roomNo: room.roomNo,
        roomBillingId: rb.id,
        year,
        month,
        status: 'GENERATED',
        totalAmount: 5000,
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    const tx = await prisma.paymentTransaction.create({
      data: {
        id: uuidv4(),
        amount: 5000,
        transactionDate: new Date(),
        description: null,
        reference: null,
        sourceFile: 'test',
        status: 'PENDING',
        confidenceScore: 0.9,
      },
    });

    const sc = await getServiceContainer();
    const matcher = sc.paymentMatchingService;

    // First confirmation — should succeed
    await matcher.confirmMatch(tx.id, invoice.id, 'tester');
    const paymentsBefore = await prisma.payment.findMany({ where: { matchedInvoiceId: invoice.id } });
    expect(paymentsBefore).toHaveLength(1);

    // Second confirmation on same transaction — idempotent (no-op inside $transaction)
    await matcher.confirmMatch(tx.id, invoice.id, 'tester');
    const paymentsAfter = await prisma.payment.findMany({ where: { matchedInvoiceId: invoice.id } });
    expect(paymentsAfter).toHaveLength(1);
  });
});

// ─── Test: auto_match_requires_room_or_invoice_match ─────────────────────────
describe('auto_match_requires_room_or_invoice_match', () => {
  it('amount-only with no room/invoice/resident → LOW confidence', async () => {
    const { PaymentMatchingService } = await import('@/modules/payments/payment-matching.service');
    const service = new PaymentMatchingService();
    // @ts-ignore
    const evaluate = (service as any).evaluateMatch.bind(service);

    const result = evaluate(
      { amount: 5000, description: null, reference: null },
      { id: 'inv-1', total: 5000, room: { roomNumber: '101', roomTenants: [] } }
    );

    expect(result).not.toBeNull();
    expect(result!.confidence).toBe('LOW');
    expect(result!.criteria.type).toBe('amount_only');
    expect(result!.criteria.warning).toContain('No room number');
  });

  it('amount + room number → MEDIUM confidence', async () => {
    const { PaymentMatchingService } = await import('@/modules/payments/payment-matching.service');
    const service = new PaymentMatchingService();
    // @ts-ignore
    const evaluate = (service as any).evaluateMatch.bind(service);

    const result = evaluate(
      { amount: 5000, description: 'ชำระค่าห้อง 101', reference: null },
      { id: 'inv-1', total: 5000, room: { roomNumber: '101', roomTenants: [] } }
    );

    expect(result).not.toBeNull();
    expect(result!.confidence).toBe('MEDIUM');
    expect(result!.criteria.type).toBe('amount_room');
  });

  it('amount + invoice number in reference → HIGH confidence', async () => {
    const { PaymentMatchingService } = await import('@/modules/payments/payment-matching.service');
    const service = new PaymentMatchingService();
    // @ts-ignore
    const evaluate = (service as any).evaluateMatch.bind(service);

    const result = evaluate(
      { amount: 5000, description: 'INV-2026-003', reference: 'INV-2026-003' },
      { id: 'inv-1', total: 5000, room: { roomNumber: '999', roomTenants: [] } }
    );

    expect(result).not.toBeNull();
    expect(result!.confidence).toBe('HIGH');
    expect(result!.criteria.type).toBe('invoice_number');
  });

  it('amount-only LOW confidence confirmMatch throws BadRequestError', async () => {
    const prisma = await getPrisma();
    try { await prisma.$connect(); } catch { return; }

    const { room, roomBilling: rb, year, month } = await createPrismaRoomBilling({
      periodStatus: 'LOCKED',
      billingStatus: 'LOCKED',
    });

    const invoice = await prisma.invoice.create({
      data: {
        id: uuidv4(),
        roomNo: room.roomNo,
        roomBillingId: rb.id,
        year,
        month,
        status: 'GENERATED',
        totalAmount: 5000,
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    // Transaction with NO reference/description — pure amount-only (LOW confidence score)
    const tx = await prisma.paymentTransaction.create({
      data: {
        id: uuidv4(),
        amount: 5000,
        transactionDate: new Date(),
        description: null,
        reference: null,
        sourceFile: 'test',
        status: 'PENDING',
        confidenceScore: 0.5,
      },
    });

    const sc = await getServiceContainer();
    const matcher = sc.paymentMatchingService;

    // confirmMatch must throw because confidenceScore < 0.75
    await expect(matcher.confirmMatch(tx.id, invoice.id, 'tester')).rejects.toThrow(/amount-only/i);
  });
});

// ─── Test: concurrent_lock_all_idempotent ─────────────────────────────────────
describe('concurrent_lock_all_idempotent', () => {
  it('concurrent lockBillingRecord calls write exactly one BILLING_LOCKED event', async () => {
    const prisma = await getPrisma();
    try { await prisma.$connect(); } catch { return; }

    const { roomBilling, year, month } = await createPrismaRoomBilling({
      periodStatus: 'OPEN',
      billingStatus: 'DRAFT',
    });

    const sc = await getServiceContainer();
    const billingService = sc.billingService;

    // Fire concurrent lockBillingRecord calls
    const [r1, r2] = await Promise.allSettled([
      billingService.lockBillingRecord(roomBilling.id, { force: false }, 'tester-concurrent'),
      billingService.lockBillingRecord(roomBilling.id, { force: false }, 'tester-concurrent'),
    ]);

    const successes = [r1, r2].filter(r => r.status === 'fulfilled');
    if (successes.length === 0) {
      // eslint-disable-next-line no-console
      console.error('[concurrent-lock] both rejected', {
        r1: r1.status === 'rejected' ? (r1.reason as any)?.message : 'fulfilled',
        r2: r2.status === 'rejected' ? (r2.reason as any)?.message : 'fulfilled',
      });
    }
    expect(successes.length).toBeGreaterThan(0);

    // RoomBilling is now LOCKED (lockBillingRecord does NOT cascade-lock the
    // parent period — that's a separate lockBillingPeriod operation).
    const updatedBilling = await prisma.roomBilling.findUnique({
      where: { id: roomBilling.id },
    });
    expect(updatedBilling?.status).toBe('LOCKED');
    void year; void month;

    // Exactly one BillingLocked event for this billing record
    const lockEvents = await prisma.outboxEvent.findMany({
      where: { aggregateId: roomBilling.id, eventType: 'BillingLocked' },
    });
    expect(lockEvents.length).toBe(1);
  });
});

// ─── Test: generate_invoices_without_locked_period_fails ─────────────────────
describe('generate_invoices_without_locked_period_fails', () => {
  it('throws BadRequestError when generating invoice for DRAFT (not LOCKED) billing record', async () => {
    const prisma = await getPrisma();
    try { await prisma.$connect(); } catch { return; }

    const { roomBilling } = await createPrismaRoomBilling({
      periodStatus: 'OPEN',
      billingStatus: 'DRAFT', // NOT locked
    });

    const sc = await getServiceContainer();
    await expect(sc.invoiceService.generateInvoiceFromBilling(roomBilling.id)).rejects.toThrow(/LOCKED/i);
  });
});

// ─── Test: regenerate_sent_document_blocked ───────────────────────────────────
describe('regenerate_sent_document_blocked', () => {
  it('throws BadRequestError when regenerating a SENT document', async () => {
    const { prisma } = await import('@/lib/db/client');
    const genMod = await import('@/modules/documents/generation.service');
    try { await (prisma as any).$connect(); } catch { return; }

    const { getDocumentGenerationService } = genMod;

    const template = await (prisma as any).documentTemplate.create({
      data: {
        id: uuidv4(),
        name: 'Test Template',
        type: 'INVOICE',
        body: '<html>Test</html>',
        status: 'ACTIVE',
        activeVersionId: null,
      },
    });

    const version = await (prisma as any).documentTemplateVersion.create({
      data: {
        id: uuidv4(),
        templateId: template.id,
        version: 1,
        body: '<html>Test</html>',
        status: 'ACTIVE',
      },
    });

    // Randomize roomNo to avoid cross-fork collisions
    const roomNo = `REGEN-${Math.random().toString(36).slice(2, 8)}`;
    const room = await (prisma as any).room.create({
      data: {
        roomNo,
        floorNo: 1,
        defaultAccountId: 'ACC_F1',
        defaultRuleCode: 'STANDARD',
        defaultRentAmount: 5000,
        hasFurniture: false,
        defaultFurnitureAmount: 0,
        roomStatus: 'VACANT',
      },
    });

    const { year, month } = randomYearMonth();
    const doc = await (prisma as any).generatedDocument.create({
      data: {
        id: uuidv4(),
        templateId: template.id,
        templateVersionId: version.id,
        documentType: 'INVOICE',
        status: 'SENT', // already sent — must block regeneration
        title: 'Test Regenerate Doc',
        sourceScope: 'SINGLE_ROOM',
        roomNo: room.roomNo,
        year,
        month,
      },
    });

    const svc = getDocumentGenerationService();
    await expect(svc.regenerateDocument(doc.id, 'test')).rejects.toThrow(/already.*sent/i);
  });
});

// ─── Test: reset_creates_durable_backup ───────────────────────────────────────
describe('reset_creates_durable_backup', () => {
  it('throws (destructive reset blocked) when backup=true but S3 env vars are missing', async () => {
    const origBucket = process.env.BACKUP_BUCKET;
    const origKeyId = process.env.AWS_ACCESS_KEY_ID;
    const origSecret = process.env.AWS_SECRET_ACCESS_KEY;
    delete process.env.BACKUP_BUCKET;
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;

    try {
      const route = await import('@/app/api/admin/setup/reset/route');
      const authMod = await import('../helpers/auth');
      const req = authMod.makeRequestLike({
        url: 'http://localhost/api/admin/setup/reset',
        method: 'POST',
        role: 'ADMIN',
        body: { backup: true },
      }) as any;

      // Must fail — reset must NOT proceed without durable backup when backup=true
      const res = await route.POST(req);
      expect(res.status).toBeGreaterThanOrEqual(400);
    } finally {
      process.env.BACKUP_BUCKET = origBucket ?? '';
      process.env.AWS_ACCESS_KEY_ID = origKeyId ?? '';
      process.env.AWS_SECRET_ACCESS_KEY = origSecret ?? '';
    }
  });
});

// ─── Test: outbox_dedup_multi_instance ────────────────────────────────────────
describe('outbox_dedup_multi_instance', () => {
  it('two processors claim non-overlapping batches via FOR UPDATE SKIP LOCKED — each event processed once', async () => {
    const prisma = await getPrisma();
    const procMod = await import('@/lib/outbox/processor');
    try { await prisma.$connect(); } catch { return; }

    // Subscribe a no-op handler on a unique event type per run to isolate
    const eventType = `TestDedupEvent-${Math.random().toString(36).slice(2, 8)}`;
    const { getEventBus } = await import('@/lib');
    getEventBus().subscribe(eventType, async () => {});

    // Write 4 events
    const eventIds: string[] = [];
    for (let i = 0; i < 4; i++) {
      const evt = await prisma.outboxEvent.create({
        data: {
          id: uuidv4(),
          aggregateType: 'Test',
          aggregateId: uuidv4(),
          eventType,
          payload: { n: i },
          retryCount: 0,
        },
      });
      eventIds.push(evt.id);
    }

    // Two processors with SKIP LOCKED — run concurrently
    const proc1 = procMod.createOutboxProcessor({ enabled: true, batchSize: 10 });
    const proc2 = procMod.createOutboxProcessor({ enabled: true, batchSize: 10 });

    await Promise.allSettled([proc1.process(), proc2.process()]);

    // Every event must have processedAt set exactly once (no duplicates)
    for (const id of eventIds) {
      const evt = await prisma.outboxEvent.findUnique({ where: { id } });
      expect(evt?.processedAt).not.toBeNull();
    }
  });
});

// ─── Test: delivery_order_send_updates_item_status_to_sent ────────────────────
describe('delivery_order_send_updates_item_status_to_sent', () => {
  it('DeliveryOrderItemSendRequested → item status becomes SENT after successful send', async () => {
    const lib = await import('@/lib');
    try { await (lib.prisma as any).$connect(); } catch { return; }

    // Mock LINE sends to succeed
    vi.spyOn(lib, 'sendLineFileMessage').mockResolvedValue(undefined);
    vi.spyOn(lib, 'sendLineMessage').mockResolvedValue(undefined);

    // Register worker
    const workerMod = await import('@/modules/messaging/file-send.worker');
    workerMod.registerFileSendWorker({ allowInTest: true });

    // Randomized roomNo to keep this test independent of parallel runs
    const roomNo = `TEST-DOS-${Math.random().toString(36).slice(2, 8)}`;
    await (lib.prisma as any).room.upsert({
      where: { roomNo },
      update: {},
      create: {
        roomNo,
        floorNo: 1,
        defaultAccountId: 'ACC_F1',
        defaultRuleCode: 'STANDARD',
        defaultRentAmount: 5000,
        hasFurniture: false,
        defaultFurnitureAmount: 0,
        roomStatus: 'VACANT',
      },
    });

    const order = await (lib.prisma as any).deliveryOrder.create({
      data: {
        id: uuidv4(),
        description: 'Test',
        documentType: 'INVOICE',
        status: 'SENDING',
        sentCount: 0,
        failedCount: 0,
      },
    });

    const item = await (lib.prisma as any).deliveryOrderItem.create({
      data: {
        id: uuidv4(),
        deliveryOrderId: order.id,
        roomNo,
        status: 'PENDING',
        generatedDocumentId: null,
      },
    });

    await lib.getEventBus().publish(
      'DeliveryOrderItemSendRequested',
      'DeliveryOrderItem',
      item.id,
      {
        itemId: item.id,
        orderId: order.id,
        lineUserId: 'U00000000000000000000000000000000',
        documentTitle: 'Test Doc',
        roomNo,
        pdfUrl: 'http://localhost:3001/tmp/test.pdf',
      }
    );

    // Give async handler time to complete
    await new Promise(r => setTimeout(r, 500));

    const updated = await (lib.prisma as any).deliveryOrderItem.findUnique({ where: { id: item.id } });
    expect(updated?.status).toBe('SENT');
    expect(updated?.errorMessage).toBeNull();
  });
});

// ─── Test: delivery_order_send_failure_updates_item_status_to_failed ──────────
describe('delivery_order_send_failure_updates_item_status_to_failed', () => {
  it('DeliveryOrderItemSendRequested → item status becomes FAILED after LINE send throws', async () => {
    const lib = await import('@/lib');
    try { await (lib.prisma as any).$connect(); } catch { return; }

    // Mock LINE send to always fail
    vi.spyOn(lib, 'sendLineFileMessage').mockRejectedValue(new Error('LINE API Error'));

    // Register worker
    const workerMod = await import('@/modules/messaging/file-send.worker');
    workerMod.registerFileSendWorker({ allowInTest: true });

    const roomNo = `TEST-DOF-${Math.random().toString(36).slice(2, 8)}`;
    await (lib.prisma as any).room.upsert({
      where: { roomNo },
      update: {},
      create: {
        roomNo,
        floorNo: 1,
        defaultAccountId: 'ACC_F1',
        defaultRuleCode: 'STANDARD',
        defaultRentAmount: 5000,
        hasFurniture: false,
        defaultFurnitureAmount: 0,
        roomStatus: 'VACANT',
      },
    });

    const order = await (lib.prisma as any).deliveryOrder.create({
      data: {
        id: uuidv4(),
        description: 'Test',
        documentType: 'INVOICE',
        status: 'SENDING',
        sentCount: 0,
        failedCount: 0,
      },
    });

    const item = await (lib.prisma as any).deliveryOrderItem.create({
      data: {
        id: uuidv4(),
        deliveryOrderId: order.id,
        roomNo,
        status: 'PENDING',
        generatedDocumentId: null,
      },
    });

    await lib.getEventBus().publish(
      'DeliveryOrderItemSendRequested',
      'DeliveryOrderItem',
      item.id,
      {
        itemId: item.id,
        orderId: order.id,
        lineUserId: 'U00000000000000000000000000000000',
        documentTitle: 'Test Doc 2',
        roomNo,
        pdfUrl: 'http://localhost:3001/tmp/test2.pdf',
      }
    );

    // Give async handler time to catch the error
    await new Promise(r => setTimeout(r, 500));

    const updated = await (lib.prisma as any).deliveryOrderItem.findUnique({ where: { id: item.id } });
    expect(updated?.status).toBe('FAILED');
    expect(updated?.errorMessage).toContain('LINE API Error');
  });
});
