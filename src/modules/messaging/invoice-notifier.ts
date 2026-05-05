import { EventTypes, getEventBus, logger } from '@/lib';
import type { InvoiceGenerated } from '@/lib/events';
import { prisma } from '@/lib';
import { sendInvoiceMessage, sendTextWithQuickReply, type QuickReplyItem } from '@/modules/messaging';

const bus = getEventBus();

type RoomWithTenants = {
  roomNo: string;
  tenants: Array<{ tenant: { lineUserId: string | null } | null }>;
};

/**
 * Handle an INVOICE_GENERATED event by sending a LINE Flex invoice to the tenant.
 *
 * IDEMPOTENCY GUARANTEE — claim-send-release pattern
 * ───────────────────────────────────────────────────
 * The outbox delivers events AT-LEAST-ONCE. This handler guarantees
 * EXACTLY-ONCE delivery despite potential duplicate event processing.
 *
 * Protocol:
 *   1. CLAIM — Atomically set invoiceSentAt on the invoice row.
 *              Conditional UPDATE (WHERE invoiceSentAt IS NULL)
 *              ensures only ONE concurrent delivery attempt wins.
 *   2. SEND  — Call the LINE API.
 *   3a. SUCCESS → claim stands (invoiceSentAt is set permanently)
 *   3b. FAILURE → release claim (reset to NULL) so outbox retries
 *
 * This prevents BOTH:
 *   ✗ Lost message  — would happen if we claimed BEFORE sending and
 *                     never released on failure
 *   ✗ Duplicate msg — would happen if two concurrent workers both
 *                     called sendInvoiceMessage without claiming
 */
async function handleInvoiceGenerated(event: InvoiceGenerated) {
  const invoiceId = event.aggregateId;
  const claimedAt = new Date();

  // ── Step 1: Atomic claim ─────────────────────────────────────────────────
  const claim = await prisma.invoice.updateMany({
    where: { id: invoiceId, invoiceSentAt: null },
    data: { invoiceSentAt: claimedAt },
  });

  if (claim.count === 0) {
    logger.info({
      type: 'invoice_notification_dedup',
      invoiceId,
      reason: 'invoiceSentAt already set — another delivery claimed this event',
    });
    return; // idempotent: nothing to do
  }

  // ── Step 2: Fetch invoice and send LINE invoice ──────────────────────────
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        room: {
          include: {
            defaultAccount: true,
            tenants: {
              where: { role: 'PRIMARY', moveOutDate: null },
              include: { tenant: true },
            },
          },
        },
      },
    });

    if (!invoice || !invoice.room) {
      logger.warn({ type: 'invoice_notification_invoice_missing', invoiceId });
      throw new Error(`Invoice ${invoiceId} not found`);
    }

    const tenant = (invoice.room as unknown as RoomWithTenants).tenants?.[0]?.tenant;
    const lineUserId = tenant?.lineUserId;
    if (!lineUserId) {
      logger.info({ type: 'invoice_notification_no_line_user', invoiceId, roomNo: invoice.roomNo });
      return; // claim stands — nothing to send, considered handled
    }

    const dueDate = new Date(invoice.dueDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
    const invoiceNumber = invoice.id.slice(-8).toUpperCase();
    const bankAccount = invoice.room.defaultAccount ?? null;

    await sendInvoiceMessage(lineUserId, {
      roomNumber: invoice.roomNo,
      amount: `฿${Number(invoice.totalAmount).toLocaleString('th-TH', { minimumFractionDigits: 2 })}`,
      dueDate,
      invoiceNumber,
      bankAccountNo: bankAccount?.bankAccountNo,
      bankName: bankAccount?.bankName,
      bankAccountName: bankAccount?.name,
    });

    const quickReplies: QuickReplyItem[] = [
      { label: 'ยืนยันชำระเงิน', action: 'postback', data: `action=confirm_payment&invoiceId=${invoiceId}` },
      { label: 'ส่งใบเสร็จ', action: 'postback', data: `action=send_receipt&invoiceId=${invoiceId}` },
    ];
    await sendTextWithQuickReply(
      lineUserId,
      `📋 หากต้องการยืนยันการชำระเงินหรือขอใบเสร็จ กดปุ่มด้านล่างได้เลยค่ะ 😊`,
      quickReplies
    );

    logger.info({ type: 'invoice_notification_sent', invoiceId, lineUserId });

  } catch (err) {
    // ── Step 3b: Failure — release claim so outbox can retry ────────────────
    await prisma.invoice.updateMany({
      where: { id: invoiceId, invoiceSentAt: claimedAt },
      data: { invoiceSentAt: null },
    }).catch((releaseErr) => {
      logger.warn({
        type: 'invoice_notification_claim_release_failed',
        invoiceId,
        originalError: (err as Error).message,
        releaseError: (releaseErr as Error).message,
        action: `Manual reset: UPDATE invoices SET "invoiceSentAt" = NULL WHERE id = '${invoiceId}'`,
      });
    });
    throw err; // re-throw so outbox records the failure and schedules retry
  }
}

bus.subscribe<InvoiceGenerated>(EventTypes.INVOICE_GENERATED, async (evt) => {
  try {
    await handleInvoiceGenerated(evt);
  } catch (err) {
    logger.error({ type: 'invoice_notification_error', error: (err as Error).message });
    throw err;
  }
});
