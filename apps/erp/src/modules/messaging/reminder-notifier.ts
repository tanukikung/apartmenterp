import { EventTypes, getEventBus, logger } from '@/lib';
import { prisma, sendLineMessage } from '@/lib';

const bus = getEventBus();

async function sendReminder(invoiceId: string) {
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
    logger.warn({ type: 'reminder_skipped_no_line', invoiceId });
    return;
  }
  const dueDate = invoice.dueDate.toISOString().split('T')[0];
  const baseUrl = process.env.APP_BASE_URL || '';
  const invoiceUrl = baseUrl ? `${baseUrl}/api/invoices/${invoice.id}/pdf` : '';
  const text = `Reminder: Invoice for Room ${invoice.room.roomNumber} is due on ${dueDate}.` + (invoiceUrl ? `\n${invoiceUrl}` : '');
  await sendLineMessage(lineUserId, text);
}

bus.subscribe(EventTypes.INVOICE_REMINDER_DUE_SOON, async (evt) => {
  try {
    await sendReminder(evt.aggregateId);
  } catch (err) {
    logger.error({ type: 'reminder_send_error', error: (err as Error).message });
  }
});

bus.subscribe(EventTypes.INVOICE_REMINDER_DUE_TODAY, async (evt) => {
  try {
    await sendReminder(evt.aggregateId);
  } catch (err) {
    logger.error({ type: 'reminder_send_error', error: (err as Error).message });
  }
});

bus.subscribe(EventTypes.INVOICE_REMINDER_OVERDUE, async (evt) => {
  try {
    await sendReminder(evt.aggregateId);
  } catch (err) {
    logger.error({ type: 'reminder_send_error', error: (err as Error).message });
  }
});

