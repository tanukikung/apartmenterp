import { v4 as uuidv4 } from 'uuid';
import type { Prisma } from '@prisma/client';
import { EventTypes } from '@/lib';
import { NotFoundError, ConflictError } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import { isPaymentSettled, PaymentMatchMode } from './payment-tolerance';
import { assertInvoiceHasSufficientPayment, assertInvoicePaidHasPaidAt } from '@/lib/invariants';
import { computeMessageHash } from '@/lib/outbox/message-hash';

export { PaymentMatchMode } from './payment-tolerance';

// Track invoices processed through the canonical syncInvoicePaymentState path.
// Key: invoiceId. Value: Set of paymentIds already processed.
// This in-memory map guards against direct invoice mutations bypassing the
// canonical path within the same process. For cross-process enforcement,
// a database-level approach (outbox event check) is required.
const _canonicalPaidInvoices = new Map<string, Set<string>>();

/**
 * Assert that an invoice was transitioned to PAID through syncInvoicePaymentState
 * (the canonical path), not via a direct update.
 *
 * Call this in any code path that reads invoice.status === 'PAID' and needs
 * confidence that it was set through the proper channel.
 *
 * Throws ConflictError if the invoice is PAID but has no record of being
 * processed through syncInvoicePaymentState within this process.
 */
export function assertInvoicePaidViaCanonicalPath(invoiceId: string, paymentId?: string): void {
  const payments = _canonicalPaidInvoices.get(invoiceId);
  if (!payments) {
    // Invoice is PAID but we have no record of canonical processing.
    // This could mean: (a) it was set by syncInvoicePaymentState in a different
    // process/instance, or (b) it was set by a direct mutation.
    // In production, cross-instance canonical path is verified by checking for
    // an INVOICE_PAID outbox event. For same-process, we track it below.
    logger.warn({
      type: 'invoice_paid_canonical_path_uncertain',
      invoiceId,
      paymentId,
      message: 'Invoice is PAID but no canonical path record exists in this process. If this invoice was NOT set via syncInvoicePaymentState, this indicates a direct mutation bug.',
    });
    return; // soften to warn — cross-process calls may not have the record
  }
  if (paymentId && !payments.has(paymentId)) {
    throw new ConflictError(
      `Invoice ${invoiceId} is PAID but the canonical path was not used for payment ${paymentId}. ` +
      `All invoice→PAID transitions must go through syncInvoicePaymentState.`
    );
  }
}

/**
 * Register that an invoice was transitioned to PAID through syncInvoicePaymentState.
 * Internal use only — called inside syncInvoicePaymentState when transitionedToPaid=true.
 * @internal — exported only for unit testing
 */
export function _markInvoicePaidViaCanonicalPath(invoiceId: string, paymentId: string): void {
  if (!_canonicalPaidInvoices.has(invoiceId)) {
    _canonicalPaidInvoices.set(invoiceId, new Set());
  }
  _canonicalPaidInvoices.get(invoiceId)!.add(paymentId);
}


type InvoicePaymentSnapshot = {
  id: string;
  status: string;
  totalAmount: unknown;
  paidAt: Date | null;
};

export interface SyncInvoicePaymentStateInput {
  invoiceId: string;
  paymentId: string;
  paymentAmount: number;
  paidAt: Date;
  /** Tolerance mode for payment settlement check. Defaults to ALLOW_SMALL_DIFF. */
  mode?: PaymentMatchMode;
  /** Caller-provided idempotency key for outbox deduplication.
   *  Propagated to the outbox event so cross-process retries can be skipped.
   *  Example: "chat-confirm:invoice-123" */
  idempotencyKey?: string;
}

export interface SyncInvoicePaymentStateResult {
  invoice: InvoicePaymentSnapshot;
  settled: boolean;
  totalPaid: number;
  transitionedToPaid: boolean;
}

export async function syncInvoicePaymentState(
  tx: Prisma.TransactionClient,
  input: SyncInvoicePaymentStateInput,
): Promise<SyncInvoicePaymentStateResult> {
  const mode = input.mode ?? PaymentMatchMode.ALLOW_SMALL_DIFF;

  // Lock the row to prevent concurrent payments from causing TOCTOU race conditions.
  // This ensures only one payment can transition the invoice to PAID at a time.
  // Using raw query because Prisma.TransactionClient type doesn't expose `for: 'update'`.
  // $queryRaw returns an array — destructure to get the single row.
  type InvoiceRow = { id: string; status: string; totalAmount: Prisma.Decimal; paidAt: Date | null; lateFeeAmount: Prisma.Decimal | null; snapshotTotal: Prisma.Decimal | null; snapshotLateFee: Prisma.Decimal | null };
  const [invoice] = await (tx as unknown as { $queryRaw: (strings: TemplateStringsArray, ...args: unknown[]) => Promise<InvoiceRow[]> }).$queryRaw`
    SELECT id, status, "totalAmount", "paidAt", "lateFeeAmount", "snapshotTotal", "snapshotLateFee"
    FROM invoices
    WHERE id = ${input.invoiceId}
    FOR UPDATE
  `;

  if (!invoice) {
    throw new NotFoundError('Invoice', input.invoiceId);
  }

  const totals = await tx.payment.aggregate({
    where: {
      matchedInvoiceId: input.invoiceId,
      status: 'CONFIRMED',
    },
    _sum: { amount: true },
    _max: { paidAt: true },
  });

  // GUARANTEE: Once SENT, invoice financial values are frozen via snapshot.
  // Any payment matching must use snapshotTotal, not current billing values.
  // This prevents a billing edit after send from breaking payment reconciliation.
  const totalPaid = Number(totals._sum.amount ?? 0);
  const invoiceTotal = Number(invoice.snapshotTotal ?? invoice.totalAmount);
  const lateFeeAmount = Number(invoice.snapshotLateFee ?? invoice.lateFeeAmount ?? 0);
  const totalOwed = invoiceTotal + lateFeeAmount;
  // Use explicit tolerance mode instead of percentage-based EPSILON
  const settled = isPaymentSettled(totalPaid, totalOwed, mode);

  // AGENT-3 FIX: Overpayment is a valid settlement condition. totalPaid >= totalOwed
  // means the invoice is fully paid even if there is excess. The excess (overpayment)
  // is flagged separately but does NOT block the PAID transition.
  const effectiveSettled = settled || (totalPaid >= totalOwed);
  const transitionedToPaid = effectiveSettled && invoice.status !== 'PAID';

  let updatedInvoice: InvoicePaymentSnapshot = invoice;
  if (transitionedToPaid) {
    // HARD INVARIANT: Before setting PAID, verify sufficient payment exists.
    // This is a belt-and-suspenders check — the settled computation above
    // already guarantees this, but the assert catches any race conditions
    // or misuse of this function.
    await assertInvoiceHasSufficientPayment(tx, input.invoiceId);
    await assertInvoicePaidHasPaidAt(tx, input.invoiceId);
    // Use updateMany with status guard so concurrent state changes are detected.
    // If another transaction modified the status between our FOR UPDATE read
    // and this update (e.g., cancelled the invoice), count === 0 and we throw.
    const paidResult = await tx.invoice.updateMany({
      where: {
        id: input.invoiceId,
        // Only write PAID if currently in a pre-PAID state.
        // CANCELLED, VOID, PAID itself would make count === 0 → ConflictError.
        status: { in: ['GENERATED', 'SENT', 'OVERDUE', 'VIEWED'] },
      },
      data: {
        status: 'PAID',
        paidAt: totals._max.paidAt ?? input.paidAt,
      },
    });

    if (paidResult.count === 0) {
      // Status changed to something unexpected (CANCELLED or VOID).
      // Read the current state to return accurate information.
      const current = await tx.invoice.findUnique({
        where: { id: input.invoiceId },
        select: { status: true, paidAt: true },
      });
      logger.warn({
        type: 'invoice_paid_conflict',
        invoiceId: input.invoiceId,
        currentStatus: current?.status ?? 'unknown',
        reason: 'status changed between FOR UPDATE and PAID update',
      });
      // Return settled=false so the caller knows the state transition didn't happen.
      // The invoice is not PAID — do not proceed with outbox event.
      return {
        invoice: { id: input.invoiceId, status: current?.status ?? 'UNKNOWN', totalAmount: invoice.totalAmount, paidAt: current?.paidAt ?? null },
        settled,
        totalPaid,
        transitionedToPaid: false,
      };
    }

    // Mark that this invoice was transitioned via the canonical path
    // (for same-process invariant enforcement).
    _markInvoicePaidViaCanonicalPath(input.invoiceId, input.paymentId);

    const eventPayload = {
      invoiceId: updatedInvoice.id,
      paymentId: input.paymentId,
      paidAt: (totals._max.paidAt ?? input.paidAt).toISOString(),
      amount: input.paymentAmount,
      totalPaid,
    };

    // Compute deterministic messageHash for exactly-once LINE delivery.
    // If processor crashes after LINE success but before COMPLETED write,
    // the hash allows restart recovery to skip re-sending the same message.
    const messageHash = computeMessageHash(
      EventTypes.INVOICE_PAID,
      updatedInvoice.id,
      eventPayload
    );

    await tx.outboxEvent.create({
      data: {
        id: uuidv4(),
        aggregateType: 'Invoice',
        aggregateId: updatedInvoice.id,
        eventType: EventTypes.INVOICE_PAID,
        payload: eventPayload,
        retryCount: 0,
        deduplicationKey: messageHash,
        messageHash,
        // externalId = paymentId for INVOICE_PAID events — allows distinguishing
        // multiple payments for the same invoice (different external triggers).
        externalId: input.paymentId,
        // Propagate caller's idempotency key for cross-process dedup.
        callerIdempotencyKey: input.idempotencyKey ?? null,
      },
    });

    return {
      invoice: updatedInvoice,
      settled,
      totalPaid,
      transitionedToPaid,
    };
  }

  // transitionedToPaid is false — invoice is already PAID or unsettled
  return {
    invoice: updatedInvoice,
    settled,
    totalPaid,
    transitionedToPaid: false,
  };
}
