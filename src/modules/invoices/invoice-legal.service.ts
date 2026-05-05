/**
 * Phase 9: Invoice Legal Immutability Service
 *
 * Once an invoice is SENT it becomes a legally binding document.
 * No amount changes, no regeneration, no status changes (except LOCKED
 * when the billing period is closed).
 *
 * Any billing correction after send creates an ADJUSTMENT document.
 * The original SENT invoice remains immutable as an audit record.
 */

import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '@/lib/db/client';
import { logger } from '@/lib/utils/logger';
import { logAudit } from '@/modules/audit';
import { logFinancialAudit } from '@/modules/financial-audit';
import { INVOICE_STATUS, BILLING_PERIOD_STATUS } from '@/lib/constants';
import {
  NotFoundError,
  BadRequestError,
  ConflictError,
} from '@/lib/utils/errors';

// ============================================================================
// Error Classes
// ============================================================================

/**
 * Thrown when a mutating operation is attempted on a SENT or LOCKED invoice.
 */
export class DocumentImmutabilityError extends BadRequestError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, details);
    this.name = 'DocumentImmutabilityError';
  }
}

// ============================================================================
// Types
// ============================================================================

type InvoiceLegalSnapshot = {
  id: string;
  roomBillingId: string;
  status: string;
  documentStatus: string;
  isLegalSnapshot: boolean;
  totalAmount: unknown;
};

// ============================================================================
// Guard Functions
// ============================================================================

/**
 * Throws DocumentImmutabilityError if the invoice is SENT or LOCKED.
 * Use this before any operation that would modify invoice data.
 */
export async function assertInvoiceIsModifiable(
  tx: Prisma.TransactionClient,
  invoiceId: string,
): Promise<void> {
  const invoice = await tx.$queryRaw<InvoiceLegalSnapshot[]>`
    SELECT
      i."id",
      i."roomBillingId",
      i."status"::text AS "status",
      i."documentStatus"::text AS "documentStatus",
      i."isLegalSnapshot" AS "isLegalSnapshot",
      i."totalAmount"
    FROM "invoices" i
    WHERE i."id" = ${invoiceId}
    FOR UPDATE OF i
  `;

  if (!invoice[0]) {
    throw new NotFoundError('Invoice', invoiceId);
  }

  const docStatus = invoice[0].documentStatus;

  if (docStatus === 'SENT' || docStatus === 'LOCKED') {
    throw new DocumentImmutabilityError(
      `Invoice ${invoiceId} is ${docStatus}. Sent invoices are legally immutable. ` +
        `Create an ADJUSTMENT document instead.`,
      { invoiceId, documentStatus: docStatus },
    );
  }
}

/**
 * Throws DocumentImmutabilityError if the invoice is not SENT or LOCKED.
 * Use this before operations that require a confirmed legal snapshot.
 */
export async function assertInvoiceIsSent(
  tx: Prisma.TransactionClient,
  invoiceId: string,
): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ id: string; documentStatus: string }>>`
    SELECT i."id", i."documentStatus"::text AS "documentStatus"
    FROM "invoices" i
    WHERE i."id" = ${invoiceId}
    FOR UPDATE OF i
  `;

  if (!rows[0]) {
    throw new NotFoundError('Invoice', invoiceId);
  }

  const docStatus = rows[0].documentStatus;
  if (docStatus !== 'SENT' && docStatus !== 'LOCKED') {
    throw new DocumentImmutabilityError(
      `Invoice ${invoiceId} is ${docStatus}. This operation requires a SENT invoice.`,
      { invoiceId, documentStatus: docStatus },
    );
  }
}

/**
 * Freezes an invoice as a legal snapshot — sets isLegalSnapshot=true
 * and documentStatus=SENT.
 * This is called atomically within sendInvoice.
 */
export async function freezeInvoiceAsLegalSnapshot(
  tx: Prisma.TransactionClient,
  invoiceId: string,
  frozenBy: string,
): Promise<void> {
  await tx.$executeRaw`
    UPDATE "invoices"
    SET
      "documentStatus" = 'SENT',
      "isLegalSnapshot" = TRUE,
      "sentAt" = COALESCE("sentAt", NOW())
    WHERE "id" = ${invoiceId}
  `;

  logger.info({
    type: 'invoice_legal_snapshot_created',
    invoiceId,
    frozenBy,
  });
}

// ============================================================================
// Adjustment Document
// ============================================================================

export interface CreateAdjustmentInput {
  originalInvoiceId: string;
  adjustmentReason: string;
  totalAmount: number;
  dueDate: Date;
  createdBy: string;
  note?: string;
}

/**
 * Creates an ADJUSTMENT document linked to an existing SENT invoice.
 * The original invoice remains SENT and immutable.
 *
 * Adjustment flow:
 *   1. Admin discovers billing error after invoice was sent
 *   2. createAdjustment() is called with corrected amounts
 *   3. New Invoice row created with documentStatus=ADJUSTMENT
 *   4. New Invoice row has originalInvoiceId pointing to original
 *   5. New Invoice row has its own roomBillingId (same period, same room)
 *   6. Tenant receives notification of adjustment
 */
export async function createAdjustment(
  input: CreateAdjustmentInput,
  requestId?: string,
): Promise<{ adjustment: Record<string, unknown>; original: Record<string, unknown> }> {
  const { originalInvoiceId, adjustmentReason, totalAmount, dueDate, createdBy, note } = input;

  const result = await prisma.$transaction(async (tx) => {
    // Lock the original invoice to prevent concurrent adjustments
    const originalRows = await tx.$queryRaw<Array<{ id: string; documentStatus: string; roomBillingId: string }>>`
      SELECT i."id", i."documentStatus"::text AS "documentStatus", i."roomBillingId"
      FROM "invoices" i
      WHERE i."id" = ${originalInvoiceId}
      FOR UPDATE OF i
    `;

    if (!originalRows[0]) {
      throw new NotFoundError('Invoice', originalInvoiceId);
    }

    const original = originalRows[0];
    if (original.documentStatus !== 'SENT' && original.documentStatus !== 'LOCKED') {
      throw new DocumentImmutabilityError(
        `Cannot create adjustment: original invoice ${originalInvoiceId} is ${original.documentStatus}. ` +
          `Only SENT invoices can have adjustments.`,
        { invoiceId: originalInvoiceId, documentStatus: original.documentStatus },
      );
    }

    // Verify no pending adjustment already exists
    const existingAdjustment = await tx.invoice.findFirst({
      where: {
        originalInvoiceId,
        documentStatus: 'ADJUSTMENT',
        // Adjustment still in DRAFT means it's being processed
        status: { in: [INVOICE_STATUS.GENERATED, INVOICE_STATUS.SENT] },
      },
    });

    if (existingAdjustment) {
      throw new ConflictError(
        `An active adjustment already exists for invoice ${originalInvoiceId}. ` +
          `Complete or cancel the existing adjustment first.`,
      );
    }

    // Get the billing period from the original invoice's room billing
    const origBilling = await tx.roomBilling.findUnique({
      where: { id: original.roomBillingId },
      include: { billingPeriod: true },
    });

    if (!origBilling) {
      throw new NotFoundError('RoomBilling', original.roomBillingId);
    }

    // Adjustments ARE allowed on CLOSED periods (escape hatch for corrections).
    // Adjustments are NOT allowed on LOCKED or ARCHIVED periods.
    if (
      origBilling.billingPeriod.status === BILLING_PERIOD_STATUS.LOCKED ||
      origBilling.billingPeriod.status === BILLING_PERIOD_STATUS.ARCHIVED
    ) {
      throw new BadRequestError(
        `Billing period ${origBilling.billingPeriod.year}-${origBilling.billingPeriod.month} is ${origBilling.billingPeriod.status}. ` +
          `No adjustments can be created for locked or archived periods.`,
      );
    }

    // Create the adjustment invoice
    const adjustmentId = uuidv4();
    const adjustmentInvoice = await tx.invoice.create({
      data: {
        id: adjustmentId,
        roomBillingId: original.roomBillingId,
        roomNo: '', // Will be filled from roomBilling below
        year: origBilling.billingPeriod.year,
        month: origBilling.billingPeriod.month,
        status: INVOICE_STATUS.GENERATED,
        documentStatus: 'ADJUSTMENT',
        isLegalSnapshot: false,
        totalAmount,
        dueDate,
        issuedAt: new Date(),
        note: note ?? null,
        originalInvoiceId,
        adjustmentReason,
      },
    });

    // Fetch the room for the adjustment invoice
    const roomBilling = await tx.roomBilling.findUnique({
      where: { id: original.roomBillingId },
    });

    if (roomBilling) {
      await tx.invoice.update({
        where: { id: adjustmentId },
        data: { roomNo: roomBilling.roomNo },
      });
    }

    // Emit audit log
    await logAudit({
      actorId: createdBy,
      actorRole: 'ADMIN',
      action: 'INVOICE_ADJUSTMENT_CREATED',
      entityType: 'Invoice',
      entityId: adjustmentId,
      metadata: {
        originalInvoiceId,
        adjustmentReason,
        totalAmount,
        createdBy,
      },
    });

    // Financial audit
    await logFinancialAudit({
      tx,
      entityType: 'Invoice',
      entityId: adjustmentId,
      action: 'INVOICE_ADJUSTMENT_CREATED',
      before: { id: originalInvoiceId, documentStatus: original.documentStatus },
      after: { id: adjustmentId, documentStatus: 'ADJUSTMENT', totalAmount },
      performedBy: createdBy,
      correlationId: requestId,
    });

    return { adjustment: adjustmentInvoice, original: { id: originalInvoiceId } };
  });

  logger.info({
    type: 'invoice_adjustment_created',
    requestId: requestId ?? null,
    originalInvoiceId,
    adjustmentId: (result.adjustment as { id: string }).id,
    createdBy,
  });

  return result as { adjustment: Record<string, unknown>; original: Record<string, unknown> };
}


/**
 * Freeze invoice financial data as immutable snapshot.
 * Called atomically when invoice transitions to SENT (after freezeInvoiceAsLegalSnapshot).
 * This captures the invoice's financial values at send time so that payment matching
 * can use frozen values instead of mutable current billing.
 */
export async function freezeInvoiceFinancialSnapshot(
  tx: Prisma.TransactionClient,
  invoiceId: string,
): Promise<void> {
  const invoice = await tx.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) throw new NotFoundError('Invoice', invoiceId);

  // Fetch the room billing for line item detail
  const rb = await tx.roomBilling.findUnique({ where: { id: invoice.roomBillingId } });

  const snapshotRent = rb?.rentAmount ?? new Prisma.Decimal(0);
  const snapshotWater = rb?.waterTotal ?? new Prisma.Decimal(0);
  const snapshotElectric = rb?.electricTotal ?? new Prisma.Decimal(0);
  const snapshotOther = new Prisma.Decimal(0);

  const lineItems = [
    { description: 'ค่าเช่า', amount: Number(snapshotRent), type: 'RENT' },
    { description: 'ค่าน้ำ', amount: Number(snapshotWater), type: 'WATER' },
    { description: 'ค่าไฟ', amount: Number(snapshotElectric), type: 'ELECTRIC' },
    ...(Number(snapshotOther) > 0 ? [{ description: 'ค่าอื่นๆ', amount: Number(snapshotOther), type: 'OTHER' }] : []),
  ];

  const content_for_hash = JSON.stringify({
    roomNo: invoice.roomNo, year: invoice.year, month: invoice.month,
    totalAmount: invoice.totalAmount, lateFeeAmount: invoice.lateFeeAmount,
    issuedAt: invoice.issuedAt,
  });
  const snapshotHash = createHash('sha256').update(content_for_hash).digest('hex');

  await tx.invoice.update({
    where: { id: invoiceId },
    data: {
      snapshotTotal: invoice.totalAmount,
      snapshotLateFee: invoice.lateFeeAmount,
      snapshotHash,
      snapshotLineItems: lineItems,
      snapshotRent,
      snapshotWater,
      snapshotElectric,
      snapshotOther,
    },
  });

  logger.info({
    type: 'invoice_financial_snapshot_created',
    invoiceId,
    snapshotTotal: Number(invoice.totalAmount),
    snapshotLateFee: Number(invoice.lateFeeAmount),
  });
}
// ============================================================================
// Period Close — Lock all SENT invoices
// ============================================================================

/**
 * Locks all SENT invoices for a billing period when the period is closed.
 * This transitions them from SENT → LOCKED.
 *
 * Called by the billing period close endpoint.
 */
export async function lockSentInvoicesInPeriod(
  tx: Prisma.TransactionClient,
  billingPeriodId: string,
  lockedBy: string,
): Promise<number> {
  const result = await tx.$executeRaw<{ count: bigint }[]>`
    UPDATE "invoices"
    SET
      "documentStatus" = 'LOCKED',
      "lockedAt" = NOW(),
      "lockedBy" = ${lockedBy}
    WHERE "roomBillingId" IN (
      SELECT "id" FROM "room_billings" WHERE "billingPeriodId" = ${billingPeriodId}
    )
      AND "documentStatus" = 'SENT'
      AND "isLegalSnapshot" = TRUE
    RETURNING "id"
  `;

  const count = Number(result);

  if (count > 0) {
    logger.info({
      type: 'billing_period_close_locked_invoices',
      billingPeriodId,
      lockedBy,
      count,
    });
  }

  return count;
}

// ============================================================================
// Billing Import Guard
// ============================================================================

/**
 * Checks whether a RoomBilling record can be modified by billing import.
 *
 * If the billing has an associated SENT/LOCKED invoice (documentStatus = SENT/LOCKED),
 * the billing import MUST skip this row — the invoice data is now legally immutable.
 *
 * Returns { canModify: boolean; invoiceId?: string; documentStatus?: string }
 */
export async function checkBillingImportCanModify(
  tx: Prisma.TransactionClient,
  billingRecordId: string,
): Promise<{ canModify: boolean; invoiceId?: string; documentStatus?: string }> {
  const rows = await tx.$queryRaw<Array<{ id: string; documentStatus: string }>>`
    SELECT i."id", i."documentStatus"::text AS "documentStatus"
    FROM "invoices" i
    WHERE i."roomBillingId" = ${billingRecordId}
      AND i."documentStatus" IN ('SENT', 'LOCKED')
    LIMIT 1
  `;

  if (rows[0]) {
    return {
      canModify: false,
      invoiceId: rows[0].id,
      documentStatus: rows[0].documentStatus,
    };
  }

  return { canModify: true };
}

/**
 * Validates that the billing period has no SENT/LOCKED invoices before closing.
 * If any SENT invoices exist, throws ConflictError.
 */
export async function assertNoSentInvoicesBeforePeriodClose(
  tx: Prisma.TransactionClient,
  billingPeriodId: string,
): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ id: string; documentStatus: string }>>`
    SELECT i."id", i."documentStatus"::text AS "documentStatus"
    FROM "invoices" i
    INNER JOIN "room_billings" rb ON rb."id" = i."roomBillingId"
    WHERE rb."billingPeriodId" = ${billingPeriodId}
      AND i."documentStatus" IN ('SENT', 'LOCKED')
    LIMIT 1
  `;

  if (rows[0]) {
    throw new ConflictError(
      `Cannot close billing period: invoice ${rows[0].id} is ${rows[0].documentStatus}. ` +
        `Close or cancel the invoice before closing the period.`,
    );
  }
}
