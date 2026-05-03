import { EventTypes, getEventBus, logger } from '@/lib';
import type { InvoicePaid } from '@/lib/events';
import { prisma } from '@/lib';
import { sendReceiptMessage } from '@/modules/messaging';

const bus = getEventBus();

type RoomWithTenants = {
  roomNo: string;
  tenants: Array<{ tenant: { lineUserId: string | null } | null }>;
};

/**
 * Handle an INVOICE_PAID event by sending a LINE receipt to the tenant.
 *
 * IDEMPOTENCY GUARANTEE — claim-send-release pattern
 * ───────────────────────────────────────────────────
 * The outbox delivers events AT-LEAST-ONCE. This handler must guarantee
 * EXACTLY-ONCE delivery to the tenant despite potential duplicate event
 * processing.
 *
 * Protocol:
 *   1. CLAIM — Atomically set notificationSentAt on the invoice row.
 *              Uses conditional UPDATE (WHERE notificationSentAt IS NULL)
 *              so only ONE concurrent delivery attempt wins the claim.
 *              If 0 rows affected → another instance claimed it → return.
 *
 *   2. SEND  — Call the LINE API. Outbox guarantees at-least-once, but
 *              the claim prevents a second concurrent winner from also
 *              calling the LINE API.
 *
 *   3a. On SUCCESS — Claim stands. The invoice row permanently records
 *                    when the notification was sent.
 *
 *   3b. On FAILURE — RELEASE the claim (reset notificationSentAt → NULL)
 *                    so the outbox can retry on the next poll cycle.
 *                    Re-throw so the outbox processor records the failure.
 *
 * Edge case: claim release itself fails (DB down). The claim is stuck set
 * and the message is never sent. In this extreme scenario an operator can
 * manually reset `notificationSentAt = NULL` to trigger a re-send. The
 * system logs a WARNING when this happens.
 *
 * This pattern avoids BOTH failure modes:
 *   ✗ Lost message  — would occur if we claimed BEFORE sending and never
 *                     released on failure.
 *   ✗ Duplicate msg — would occur if we sent without claiming first (two
 *                     concurrent workers both call sendReceiptMessage).
 */
async function handleInvoicePaid(event: InvoicePaid) {
  const invoiceId = event.aggregateId;
  const claimedAt = new Date();

  // ── Step 1: Atomic claim ─────────────────────────────────────────────────────
  const claim = await prisma.invoice.updateMany({
    where: { id: invoiceId, notificationSentAt: null },
    data: { notificationSentAt: claimedAt },
  });

  if (claim.count === 0) {
    logger.info({
      type: 'payment_notification_dedup',
      invoiceId,
      reason: 'notificationSentAt already set — another delivery already claimed this event',
    });
    return; // idempotent: nothing to do
  }

  // ── Step 2: Fetch invoice and send LINE receipt ──────────────────────────────
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        room: {
          include: {
            tenants: {
              where: { role: 'PRIMARY', moveOutDate: null },
              include: { tenant: true },
            },
          },
        },
      },
    });

    if (!invoice || !invoice.room) {
      logger.warn({ type: 'payment_notification_invoice_missing', invoiceId });
      // Invoice gone — release claim and let the outbox mark the event dead.
      throw new Error(`Invoice ${invoiceId} not found when sending payment notification`);
    }

    const tenant = (invoice.room as unknown as RoomWithTenants).tenants?.[0]?.tenant;
    const lineUserId = tenant?.lineUserId;
    if (!lineUserId) {
      // No LINE user linked — release claim gracefully. The outbox should NOT
      // retry indefinitely for tenants without LINE. Mark as "handled" by
      // NOT throwing — but we release the claim because nothing was sent.
      // Re-claim will be skipped if another delivery arrives (claim still set).
      logger.info({ type: 'payment_notification_no_line_user', invoiceId, roomNo: invoice.roomNo });
      // Claim stands — notification is considered "handled" (no-op, no recipient).
      return;
    }

    const baseUrl = process.env.APP_BASE_URL || '';
    const pdfUrl = `${baseUrl}/api/invoices/${encodeURIComponent(invoiceId)}/pdf`;
    const paidDate = invoice.paidAt
      ? new Date(invoice.paidAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
      : new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });

    await sendReceiptMessage(lineUserId, {
      roomNumber: invoice.roomNo,
      amount: `฿${Number(invoice.totalAmount).toLocaleString('th-TH', { minimumFractionDigits: 2 })}`,
      paidDate,
      invoiceNumber: invoice.id.slice(-8).toUpperCase(),
      downloadLink: pdfUrl,
    });

    // ── Step 3a: Success — claim stands ─────────────────────────────────────────
    logger.info({ type: 'payment_notification_sent', invoiceId, lineUserId, roomNo: invoice.roomNo });

  } catch (err) {
    // ── Step 3b: Failure — release claim so outbox can retry ────────────────────
    // Use WHERE notificationSentAt = claimedAt to avoid resetting a claim that
    // was made by a DIFFERENT delivery (tiny race window: another instance claimed,
    // then our outbox retry also claimed in a separate attempt). In practice this
    // is impossible due to the UPDATE claim filter, but the WHERE guard is safe.
    await prisma.invoice.updateMany({
      where: { id: invoiceId, notificationSentAt: claimedAt },
      data: { notificationSentAt: null },
    }).catch((releaseErr) => {
      // Release failed — claim is stuck. Log a WARNING so an operator can manually
      // reset: UPDATE invoices SET "notificationSentAt" = NULL WHERE id = '<id>'
      logger.warn({
        type: 'payment_notification_claim_release_failed',
        invoiceId,
        claimedAt: claimedAt.toISOString(),
        originalError: (err as Error).message,
        releaseError: (releaseErr as Error).message,
        action: 'Manual reset required: UPDATE invoices SET "notificationSentAt" = NULL WHERE id = \'' + invoiceId + '\'',
      });
    });

    // Re-throw so the outbox processor records the failure, increments retryCount,
    // and schedules a retry. Without re-throwing, the event is silently marked
    // "processed" (processedAt set) even though the notification was never sent.
    throw err;
  }
}

bus.subscribe<InvoicePaid>(EventTypes.INVOICE_PAID, async (evt) => {
  try {
    await handleInvoicePaid(evt);
  } catch (err) {
    logger.error({ type: 'payment_notification_error', error: (err as Error).message });
    throw err;
  }
});
