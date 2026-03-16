import { EventTypes, getEventBus, logger } from '@/lib';
import type { InvoiceGenerated } from '@/lib/events';
import { prisma } from '@/lib';
import { sendInvoiceMessage } from '@/lib';

const bus = getEventBus();

async function handleInvoiceGenerated(event: InvoiceGenerated) {
  const invoiceId = event.aggregateId;
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      room: {
        include: {
          roomTenants: {
            where: { role: 'PRIMARY', moveOutDate: null },
            include: { tenant: true },
          },
        },
      },
    },
  });
  if (!invoice || !invoice.room) return;
  const tenant = invoice.room.roomTenants?.[0]?.tenant;
  const lineUserId = tenant?.lineUserId;
  if (!lineUserId) {
    logger.warn({ type: 'invoice_notification_skipped_no_line', invoiceId });
    return;
  }
  const monthStr = `${invoice.year}-${String(invoice.month).padStart(2, '0')}`;
  const total = Number(invoice.total).toFixed(2);
  const dueDate = invoice.dueDate.toISOString().split('T')[0];
  const baseUrl = process.env.APP_BASE_URL || '';
  const invoiceUrl = baseUrl ? `${baseUrl}/api/invoices/${invoice.id}/pdf` : undefined;
  await sendInvoiceMessage(lineUserId, {
    roomNumber: invoice.room.roomNumber,
    month: monthStr,
    total,
    dueDate,
    invoiceUrl,
  });
}

bus.subscribe<InvoiceGenerated>(EventTypes.INVOICE_GENERATED, async (evt) => {
  try {
    await handleInvoiceGenerated(evt);
  } catch (err) {
    logger.error({ type: 'invoice_notification_error', error: (err as Error).message });
  }
});
