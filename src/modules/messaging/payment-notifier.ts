import { EventTypes, getEventBus, logger } from '@/lib';
import type { InvoicePaid } from '@/lib/events';
import { prisma } from '@/lib';
import { sendReceiptMessage } from '@/modules/messaging';

const bus = getEventBus();

type RoomWithTenants = {
  roomNo: string;
  tenants: Array<{ tenant: { lineUserId: string | null } | null }>;
};

async function handleInvoicePaid(event: InvoicePaid) {
  const invoiceId = event.aggregateId;
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
  if (!invoice || !invoice.room) return;
  const tenant = (invoice.room as any as RoomWithTenants).tenants?.[0]?.tenant;
  const lineUserId = tenant?.lineUserId;
  if (!lineUserId) return;
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
}

bus.subscribe<InvoicePaid>(EventTypes.INVOICE_PAID, async (evt) => {
  try {
    await handleInvoicePaid(evt);
  } catch (err) {
    logger.error({ type: 'payment_notification_error', error: (err as Error).message });
  }
});

