import { EventTypes, getEventBus, logger } from '@/lib';
import type { InvoicePaid } from '@/lib/events';
import { prisma } from '@/lib';
import { sendLineMessage } from '@/lib';

const bus = getEventBus();

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
  const tenant = (invoice.room as any).tenants?.[0]?.tenant;
  const lineUserId = tenant?.lineUserId;
  if (!lineUserId) return;
  const message = `Payment received for Room ${invoice.roomNo}. Thank you.`;
  await sendLineMessage(lineUserId, message);
}

bus.subscribe<InvoicePaid>(EventTypes.INVOICE_PAID, async (evt) => {
  try {
    await handleInvoicePaid(evt);
  } catch (err) {
    logger.error({ type: 'payment_notification_error', error: (err as Error).message });
  }
});

