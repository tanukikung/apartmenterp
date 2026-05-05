/**
 * Phase 9: Invoice Legal Immutability Tests
 *
 * Covers the core invariant: SENT invoices are legally immutable.
 *
 * Test cases:
 *  1. Attempt regenerate sent invoice         → throws DocumentImmutabilityError
 *  2. Attempt update amount on sent invoice  → throws DocumentImmutabilityError
 *  3. Create adjustment for sent invoice     → new ADJUSTMENT doc created, original intact
 *  4. Close billing period with sent invoices → all SENT → LOCKED
 *  5. Send invoice → immediately lock period  → invoice is both SENT and LOCKED
 *  6. Attempt to revert LOCKED invoice       → throws DocumentImmutabilityError
 *  7. Adjustment doc shows correct original amount and adjustment tracked separately
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { createAdjustment, assertInvoiceIsModifiable, assertInvoiceIsSent, lockSentInvoicesInPeriod, checkBillingImportCanModify } from '@/modules/invoices/invoice-legal.service';
import { DocumentImmutabilityError } from '@/modules/invoices/invoice-legal.service';
import { INVOICE_STATUS, BILLING_STATUS, BILLING_PERIOD_STATUS } from '@/lib/constants';

const prisma = new PrismaClient();

describe('Invoice Legal Immutability', () => {
  let periodId: string;
  let billingRecordId: string;
  let invoiceId: string;
  let roomNo: string;

  beforeEach(async () => {
    // Create a billing period, room, billing record, and invoice in SENT state
    const period = await prisma.billingPeriod.create({
      data: { year: 2026, month: 5, status: BILLING_PERIOD_STATUS.OPEN, dueDay: 25 },
    });
    periodId = period.id;

    const room = await prisma.room.findFirst({ where: { roomNo: '801' } });
    if (!room) throw new Error('Seed room 801 not found — run seed first');
    roomNo = room.roomNo;

    const billing = await prisma.roomBilling.create({
      data: {
        billingPeriodId: periodId,
        roomNo,
        recvAccountId: room.defaultAccountId,
        ruleCode: 'DEFAULT',
        rentAmount: 15000,
        totalDue: 15000,
        status: BILLING_STATUS.INVOICED,
      },
    });
    billingRecordId = billing.id;

    const invoice = await prisma.invoice.create({
      data: {
        roomBillingId: billingRecordId,
        roomNo,
        year: 2026,
        month: 5,
        status: INVOICE_STATUS.SENT,
        documentStatus: 'SENT',
        isLegalSnapshot: true,
        totalAmount: 15000,
        dueDate: new Date(2026, 4, 25),
        sentAt: new Date(),
      },
    });
    invoiceId = invoice.id;
  });

  afterEach(async () => {
    // Clean up created records
    await prisma.invoice.deleteMany({ where: { id: invoiceId } }).catch(() => {});
    await prisma.roomBilling.deleteMany({ where: { id: billingRecordId } }).catch(() => {});
    await prisma.billingPeriod.deleteMany({ where: { id: periodId } }).catch(() => {});
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 1: Attempt regenerate sent invoice → throws DocumentImmutabilityError
  // ─────────────────────────────────────────────────────────────────────────────
  it('throws DocumentImmutabilityError when regenerating a SENT invoice', async () => {
    await expect(
      prisma.$transaction(async (tx) => assertInvoiceIsModifiable(tx, invoiceId))
    ).rejects.toThrow(DocumentImmutabilityError);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 2: Attempt update amount on sent invoice → throws DocumentImmutabilityError
  // ─────────────────────────────────────────────────────────────────────────────
  it('throws DocumentImmutabilityError when updating amount on SENT invoice', async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await assertInvoiceIsModifiable(tx, invoiceId);
        // If guard passed, try to update — should not reach here
        return tx.invoice.update({ where: { id: invoiceId }, data: { totalAmount: 20000 } });
      })
    ).rejects.toThrow(DocumentImmutabilityError);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 3: Create adjustment for sent invoice → new ADJUSTMENT doc created
  // ─────────────────────────────────────────────────────────────────────────────
  it('creates an ADJUSTMENT document when original invoice is SENT', async () => {
    const result = await createAdjustment({
      originalInvoiceId: invoiceId,
      adjustmentReason: 'Undercharged water usage by ฿500',
      totalAmount: 15500,
      dueDate: new Date(2026, 4, 25),
      createdBy: 'owner',
    });

    expect(result.adjustment).toBeDefined();
    const adjId = (result.adjustment as { id: string }).id;

    // Verify adjustment exists and has correct fields
    const adj = await prisma.invoice.findUnique({ where: { id: adjId } });
    expect(adj).not.toBeNull();
    expect(adj!.documentStatus).toBe('ADJUSTMENT');
    expect(adj!.originalInvoiceId).toBe(invoiceId);
    expect(adj!.adjustmentReason).toBe('Undercharged water usage by ฿500');
    expect(Number(adj!.totalAmount)).toBe(15500);

    // Original invoice must be unchanged (still SENT)
    const original = await prisma.invoice.findUnique({ where: { id: invoiceId } });
    expect(original!.documentStatus).toBe('SENT');
    expect(original!.isLegalSnapshot).toBe(true);
    expect(Number(original!.totalAmount)).toBe(15000);

    // Clean up adjustment
    await prisma.invoice.deleteMany({ where: { id: adjId } }).catch(() => {});
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 4: Close billing period with sent invoices → all SENT → LOCKED
  // ─────────────────────────────────────────────────────────────────────────────
  it('lockSentInvoicesInPeriod transitions SENT invoices to LOCKED', async () => {
    // Ensure invoice is SENT
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: { documentStatus: 'SENT', isLegalSnapshot: true },
    });

    const count = await prisma.$transaction(async (tx) =>
      lockSentInvoicesInPeriod(tx, periodId, 'owner')
    );

    expect(count).toBe(1);

    const locked = await prisma.invoice.findUnique({ where: { id: invoiceId } });
    expect(locked!.documentStatus).toBe('LOCKED');
    expect(locked!.lockedAt).not.toBeNull();
    expect(locked!.lockedBy).toBe('owner');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 5: Send invoice → immediately lock period → invoice is both SENT and LOCKED
  // ─────────────────────────────────────────────────────────────────────────────
  it('invoice can be both SENT and LOCKED when period is closed immediately', async () => {
    // Create a fresh invoice in GENERATED state
    const freshInvoice = await prisma.invoice.create({
      data: {
        roomBillingId: billingRecordId,
        roomNo,
        year: 2026,
        month: 5,
        status: INVOICE_STATUS.SENT,
        documentStatus: 'SENT',
        isLegalSnapshot: true,
        totalAmount: 15000,
        dueDate: new Date(2026, 4, 25),
        sentAt: new Date(),
      },
    });

    // Close the period (which locks SENT invoices)
    await prisma.$transaction(async (tx) =>
      lockSentInvoicesInPeriod(tx, periodId, 'owner')
    );

    const inv = await prisma.invoice.findUnique({ where: { id: freshInvoice.id } });
    expect(inv!.documentStatus).toBe('LOCKED');
    expect(inv!.isLegalSnapshot).toBe(true);
    expect(inv!.sentAt).not.toBeNull();

    // Clean up
    await prisma.invoice.deleteMany({ where: { id: freshInvoice.id } }).catch(() => {});
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 6: Attempt to revert LOCKED invoice → throws DocumentImmutabilityError
  // ─────────────────────────────────────────────────────────────────────────────
  it('throws DocumentImmutabilityError when reverting a LOCKED invoice', async () => {
    // Lock the invoice first
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: { documentStatus: 'LOCKED', lockedAt: new Date(), lockedBy: 'owner' },
    });

    await expect(
      prisma.$transaction(async (tx) => assertInvoiceIsModifiable(tx, invoiceId))
    ).rejects.toThrow(DocumentImmutabilityError);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 7: checkBillingImportCanModify returns false for SENT invoice billing
  // ─────────────────────────────────────────────────────────────────────────────
  it('checkBillingImportCanModify returns canModify=false for SENT invoice billing', async () => {
    const result = await prisma.$transaction(async (tx) =>
      checkBillingImportCanModify(tx, billingRecordId)
    );

    expect(result.canModify).toBe(false);
    expect(result.invoiceId).toBe(invoiceId);
    expect(result.documentStatus).toBe('SENT');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 8: assertInvoiceIsSent passes for SENT invoice
  // ─────────────────────────────────────────────────────────────────────────────
  it('assertInvoiceIsSent does not throw for SENT invoice', async () => {
    await expect(
      prisma.$transaction(async (tx) => assertInvoiceIsSent(tx, invoiceId))
    ).resolves.toBeUndefined();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 9: assertInvoiceIsSent throws for GENERATED invoice
  // ─────────────────────────────────────────────────────────────────────────────
  it('assertInvoiceIsSent throws for GENERATED invoice', async () => {
    // Create a GENERATED invoice
    const genInvoice = await prisma.invoice.create({
      data: {
        roomBillingId: billingRecordId,
        roomNo,
        year: 2026,
        month: 5,
        status: INVOICE_STATUS.GENERATED,
        documentStatus: 'DRAFT',
        totalAmount: 15000,
        dueDate: new Date(2026, 4, 25),
      },
    });

    await expect(
      prisma.$transaction(async (tx) => assertInvoiceIsSent(tx, genInvoice.id))
    ).rejects.toThrow(DocumentImmutabilityError);

    await prisma.invoice.deleteMany({ where: { id: genInvoice.id } }).catch(() => {});
  });
});
