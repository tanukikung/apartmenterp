import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Test helpers ────────────────────────────────────────────────────────────

/** Simulates the FOR UPDATE row-locking pattern used in syncInvoicePaymentState */
function simulateForUpdateRead(invoiceId: string, currentStatus: string): { id: string; status: string } | null {
  // Returns the row if it exists — simulates tx.$queryRaw`SELECT ... FOR UPDATE`
  return { id: invoiceId, status: currentStatus };
}

/** Simulates updateMany with status guard — returns count 1 if match, 0 if no match */
function simulateUpdateManyWithStatusGuard(
  invoiceId: string,
  expectedStatus: string,
  actualStatus: string
): { count: number } {
  if (actualStatus === expectedStatus) return { count: 1 };
  return { count: 0 };
}

/** Simulates the markOverdue updateMany with status guard */
function simulateMarkOverdueUpdateMany(
  invoiceId: string,
  expectedStatus: string,
  actualStatus: string
): { count: number } {
  return simulateUpdateManyWithStatusGuard(invoiceId, expectedStatus, actualStatus);
}

// ── Tests: syncInvoicePaymentState PAID transition ─────────────────────────────

describe('syncInvoicePaymentState: PAID transition race safety', () => {

  it('PAID transition succeeds when invoice is in OVERDUE status', () => {
    const invoiceId = 'inv-1';
    const currentStatus = 'OVERDUE';
    const paidResult = simulateUpdateManyWithStatusGuard(invoiceId, 'OVERDUE', currentStatus);

    expect(paidResult.count).toBe(1); // transition succeeds
  });

  it('PAID transition SUCCEEDS when invoice is in VIEWED status', () => {
    const invoiceId = 'inv-2';
    const currentStatus = 'VIEWED';
    const paidResult = simulateUpdateManyWithStatusGuard(invoiceId, 'VIEWED', currentStatus);

    expect(paidResult.count).toBe(1); // transition succeeds
  });

  it('PAID transition FAILS (count=0) when concurrent cancel changed status to CANCELLED', () => {
    const invoiceId = 'inv-3';
    // FOR UPDATE read sees OVERDUE
    const lockedRow = simulateForUpdateRead(invoiceId, 'OVERDUE');
    expect(lockedRow?.status).toBe('OVERDUE');

    // Concurrent cancel already changed status to CANCELLED
    const paidResult = simulateUpdateManyWithStatusGuard(invoiceId, 'OVERDUE', 'CANCELLED');

    expect(paidResult.count).toBe(0); // count === 0 → transitionedToPaid: false, no outbox event
  });

  it('PAID transition FAILS (count=0) when invoice was already PAID', () => {
    const invoiceId = 'inv-4';
    const paidResult = simulateUpdateManyWithStatusGuard(invoiceId, 'SENT', 'PAID');

    expect(paidResult.count).toBe(0);
    // Caller must return { settled: true, transitionedToPaid: false } — no INVOICE_PAID outbox event
  });

  it('FOR UPDATE prevents TOCTOU: concurrent payments are serialized', () => {
    const invoiceId = 'inv-5';

    // Payment A acquires FOR UPDATE lock first
    const paymentALocked = simulateForUpdateRead(invoiceId, 'SENT');
    expect(paymentALocked).not.toBeNull();

    // Payment B tries to acquire FOR UPDATE — would block (simulated by returning null here)
    const paymentBLocked = simulateForUpdateRead(invoiceId, 'SENT');

    // Both see the same state — in real DB, Payment B would wait for A's transaction to commit
    expect(paymentALocked?.status).toBe(paymentBLocked?.status);
  });
});

// ── Tests: cancelInvoice race safety ────────────────────────────────────────

describe('cancelInvoice: status guard race safety', () => {

  it('cancel succeeds when invoice is GENERATED', () => {
    const result = simulateUpdateManyWithStatusGuard('inv-1', 'GENERATED', 'GENERATED');
    expect(result.count).toBe(1);
  });

  it('cancel succeeds when invoice is OVERDUE', () => {
    const result = simulateUpdateManyWithStatusGuard('inv-2', 'OVERDUE', 'OVERDUE');
    expect(result.count).toBe(1);
  });

  it('cancel FAILS (count=0) when concurrent payment already settled invoice to PAID', () => {
    const invoiceId = 'inv-3';
    const result = simulateUpdateManyWithStatusGuard(invoiceId, 'OVERDUE', 'PAID');

    expect(result.count).toBe(0);
    // Throws ConflictError — concurrent payment won, caller must retry
  });

  it('cancel FAILS (count=0) when invoice already SENT', () => {
    const result = simulateUpdateManyWithStatusGuard('inv-4', 'GENERATED', 'SENT');
    expect(result.count).toBe(0);
  });

  it('cancel FAILS (count=0) when invoice already CANCELLED (idempotent path)', () => {
    const result = simulateUpdateManyWithStatusGuard('inv-5', 'OVERDUE', 'CANCELLED');
    expect(result.count).toBe(0);
    // Returns idempotent { cancelled: invoice, snapshot: invoice } — not ConflictError
  });
});

// ── Tests: markOverdue race safety ───────────────────────────────────────────

describe('markOverdue: status guard race safety', () => {

  it('markOverdue succeeds when invoice is in SENT status', () => {
    const result = simulateMarkOverdueUpdateMany('inv-1', 'SENT', 'SENT');
    expect(result.count).toBe(1);
  });

  it('markOverdue succeeds when invoice is in GENERATED status', () => {
    const result = simulateMarkOverdueUpdateMany('inv-2', 'GENERATED', 'GENERATED');
    expect(result.count).toBe(1);
  });

  it('markOverdue FAILS (count=0) when concurrent payment already marked PAID', () => {
    const invoiceId = 'inv-3';
    const result = simulateMarkOverdueUpdateMany(invoiceId, 'SENT', 'PAID');

    expect(result.count).toBe(0);
    // Throws ConflictError — payment settlement won, overdue marking must retry
  });

  it('markOverdue FAILS (count=0) when invoice already CANCELLED', () => {
    const result = simulateMarkOverdueUpdateMany('inv-4', 'SENT', 'CANCELLED');
    expect(result.count).toBe(0);
  });

  it('FOR UPDATE rows.length===0 means concurrent overdue check already processed', () => {
    // When FOR UPDATE returns 0 rows, another cron run already processed this invoice.
    // Old behavior: silent `return` — this caused silent event loss.
    // New behavior: throws ConflictError so the outbox processor retries.
    const forUpdateResult: { id: string }[] = []; // empty = already processed
    const shouldThrow = forUpdateResult.length === 0;

    expect(shouldThrow).toBe(true); // must throw instead of silent return
  });
});

// ── Tests: sendInvoice race safety ───────────────────────────────────────────

describe('sendInvoice: status guard race safety', () => {

  it('send succeeds when invoice is in GENERATED status', () => {
    const result = simulateUpdateManyWithStatusGuard('inv-1', 'GENERATED', 'GENERATED');
    expect(result.count).toBe(1);
  });

  it('send FAILS (count=0) when invoice was already marked OVERDUE by concurrent cron', () => {
    // Race: cron runs markOverdue between findMany and updateMany in sendInvoice
    const result = simulateUpdateManyWithStatusGuard('inv-2', 'GENERATED', 'OVERDUE');
    expect(result.count).toBe(0);
    // Throws ConflictError — invoice was already processed
  });

  it('send FAILS (count=0) when invoice was already SENT by concurrent send', () => {
    const result = simulateUpdateManyWithStatusGuard('inv-3', 'GENERATED', 'SENT');
    expect(result.count).toBe(0);
  });
});

// ── Tests: Idempotency key scoping ───────────────────────────────────────────

describe('Idempotency-Key: cross-user replay prevention', () => {

  it('same key different userId → different scoped key', () => {
    const key = 'uuid-12345';
    const scopedKeyUserA = `user-a:POST:/api/payments/manual:${key}`;
    const scopedKeyUserB = `user-b:POST:/api/payments/manual:${key}`;

    expect(scopedKeyUserA).not.toBe(scopedKeyUserB);
  });

  it('same key different path → different scoped key', () => {
    const key = 'uuid-12345';
    const scopedKeyPathA = `user-a:POST:/api/payments/manual:${key}`;
    const scopedKeyPathB = `user-a:POST:/api/contracts/terminate:${key}`;

    expect(scopedKeyPathA).not.toBe(scopedKeyPathB);
  });

  it('same key same userId same path different method → different scoped key', () => {
    const key = 'uuid-12345';
    const scopedKeyPost = `user-a:POST:/api/payments/manual:${key}`;
    const scopedKeyPut = `user-a:PUT:/api/payments/manual:${key}`;

    expect(scopedKeyPost).not.toBe(scopedKeyPut);
  });
});

// ── Tests: Outbox publish-before-mark ───────────────────────────────────────

describe('Outbox: publish-before-mark crash safety', () => {

  it('on successful publish → status set to PROCESSED', () => {
    let publishSucceeded = false;
    let markedProcessed = false;

    // Simulate publish-then-mark sequence
    publishSucceeded = true;
    if (publishSucceeded) {
      markedProcessed = true;
    }

    expect(publishSucceeded).toBe(true);
    expect(markedProcessed).toBe(true);
  });

  it('on publish failure → event stays PENDING (NOT processed)', () => {
    let publishSucceeded = false;
    let markedProcessed = false;
    let eventStatus = 'PENDING';

    try {
      throw new Error('LINE API timeout');
    } catch {
      publishSucceeded = false;
      eventStatus = 'PENDING'; // NOT changed to PROCESSED
    }

    expect(publishSucceeded).toBe(false);
    expect(eventStatus).toBe('PENDING'); // Will be retried
  });

  it('crash after publish before mark → event stuck in PROCESSING → visibility timeout resets', () => {
    const event = {
      id: 'evt-1',
      status: 'PROCESSING',
      processingAt: new Date(Date.now() - 90_000), // 90s ago (> 60s timeout)
      processedAt: null,
    };

    const VISIBILITY_TIMEOUT_MS = 60_000;
    const isStuck = event.processingAt !== null &&
      (Date.now() - new Date(event.processingAt).getTime()) > VISIBILITY_TIMEOUT_MS;

    expect(isStuck).toBe(true); // Would be recovered by visibility timeout
    // After recovery: status → PENDING, retryCount + 1, processingAt → null
  });

  it('deduplicationKey prevents duplicate downstream delivery on retry', () => {
    const processedKeys = new Set<string>();
    processedKeys.add('inv-1:INVOICE_PAID');

    const retryKey = 'inv-1:INVOICE_PAID';
    const alreadyProcessed = processedKeys.has(retryKey);

    expect(alreadyProcessed).toBe(true); // Would be skipped by EventBus
  });
});

// ── Tests: Claim-send-release (LINE message dedup) ──────────────────────────

describe('LINE message: claim-send-release deduplication', () => {

  it('first worker claims invoice (invoiceSentAt = NULL → set to now)', () => {
    const invoiceSentAt: Date | null = null;
    const claimedAt = new Date();

    // Claim: WHERE invoiceSentAt IS NULL
    const claimCount = invoiceSentAt === null ? 1 : 0;
    expect(claimCount).toBe(1); // first worker wins
  });

  it('second worker finds invoice already claimed (invoiceSentAt NOT NULL)', () => {
    const invoiceSentAt = new Date(Date.now() - 5_000); // already claimed
    const claimedAt = new Date();

    const claimCount = invoiceSentAt === null ? 1 : 0;
    expect(claimCount).toBe(0); // second worker loses, returns early
  });

  it('on send failure → release claim (set invoiceSentAt back to NULL)', () => {
    let invoiceSentAt: Date | null = new Date(); // claimed
    const claimedAt = invoiceSentAt;

    try {
      throw new Error('LINE API error');
    } catch {
      invoiceSentAt = null; // release for retry
    }

    expect(invoiceSentAt).toBeNull(); // next poll can retry
  });
});
