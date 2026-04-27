import { EventTypes, getEventBus, logger, type QuickReplyItem } from '@/lib';
import type { InvoiceGenerated } from '@/lib/events';
import { prisma } from '@/lib';
import { sendInvoiceMessage, sendTextWithQuickReply } from '@/modules/messaging';

const bus = getEventBus();

type RoomWithTenants = {
  roomNo: string;
  tenants: Array<{ tenant: { lineUserId: string | null } | null }>;
};

async function handleInvoiceGenerated(event: InvoiceGenerated) {
  const invoiceId = event.aggregateId;
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
  if (!invoice || !invoice.room) return;
  const tenant = (invoice.room as unknown as RoomWithTenants).tenants?.[0]?.tenant;
  const lineUserId = tenant?.lineUserId;
  if (!lineUserId) {
    logger.warn({ type: 'invoice_notification_skipped_no_line', invoiceId });
    return;
  }
  const dueDate = new Date(invoice.dueDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
  const invoiceNumber = invoice.id.slice(-8).toUpperCase();

  const bankAccount = invoice.room.defaultAccount ?? null;

  // Send Flex Invoice card + quick reply buttons
  await sendInvoiceMessage(lineUserId, {
    roomNumber: invoice.roomNo,
    amount: `฿${Number(invoice.totalAmount).toLocaleString('th-TH', { minimumFractionDigits: 2 })}`,
    dueDate,
    invoiceNumber,
    bankAccountNo: bankAccount?.bankAccountNo,
    bankName: bankAccount?.bankName,
    bankAccountName: bankAccount?.name,
  });

  // Follow up with quick reply text
  const quickReplies: QuickReplyItem[] = [
    { label: 'ยืนยันชำระเงิน', action: 'postback', data: `action=confirm_payment&invoiceId=${invoiceId}` },
    { label: 'ส่งใบเสร็จ', action: 'postback', data: `action=send_receipt&invoiceId=${invoiceId}` },
  ];
  await sendTextWithQuickReply(
    lineUserId,
    `📋 หากต้องการยืนยันการชำระเงินหรือขอใบเสร็จ กดปุ่มด้านล่างได้เลยค่ะ 😊`,
    quickReplies
  );
}

bus.subscribe<InvoiceGenerated>(EventTypes.INVOICE_GENERATED, async (evt) => {
  try {
    await handleInvoiceGenerated(evt);
  } catch (err) {
    logger.error({ type: 'invoice_notification_error', error: (err as Error).message });
  }
});
