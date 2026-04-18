import { EventTypes, getEventBus, logger, prisma, sendLineMessage, type QuickReplyItem } from '@/lib';
import { sendReminderMessage, sendTextWithQuickReply } from '@/modules/messaging';
import { buildInvoiceAccessUrl } from '@/lib/invoices/access';

const bus = getEventBus();

type RoomWithTenants = {
  roomNo: string;
  tenants: Array<{ tenant: { lineUserId: string | null } | null }>;
};

async function sendReminder(invoiceId: string, eventType: string) {
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
  if (!lineUserId) {
    logger.warn({ type: 'reminder_skipped_no_line', invoiceId });
    return;
  }
  const dueDate = new Date(invoice.dueDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
  const baseUrl = process.env.APP_BASE_URL || '';
  const paymentLink = buildInvoiceAccessUrl(invoice.id, { absoluteBaseUrl: baseUrl, signed: true });
  const amount = `฿${Number(invoice.totalAmount).toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;

  // Calculate overdue days
  let daysOverdue: number | undefined;
  if (eventType === EventTypes.INVOICE_REMINDER_OVERDUE) {
    daysOverdue = Math.ceil((Date.now() - new Date(invoice.dueDate).getTime()) / (1000 * 60 * 60 * 24));
  }

  // Send Flex Reminder card
  await sendReminderMessage(lineUserId, {
    roomNumber: invoice.roomNo,
    amount,
    dueDate,
    daysOverdue,
    paymentLink,
  });

  // Follow up with quick reply text
  const quickReplies: QuickReplyItem[] = [
    { label: 'ยืนยันชำระเงิน', action: 'postback', data: `action=confirm_payment&invoiceId=${invoiceId}` },
    { label: 'ส่งใบเสร็จ', action: 'postback', data: `action=send_receipt&invoiceId=${invoiceId}` },
  ];
  await sendTextWithQuickReply(
    lineUserId,
    `💰 ท่านมียอดค้างชำระ ${amount} กรุณาชำระภายในวันที่ ${dueDate} นะคะ หากชำระแล้วกดปุ่มด้านล่างได้เลยค่ะ`,
    quickReplies
  );
}

bus.subscribe(EventTypes.INVOICE_REMINDER_DUE_SOON, async (evt) => {
  try {
    await sendReminder(evt.aggregateId, EventTypes.INVOICE_REMINDER_DUE_SOON);
  } catch (err) {
    logger.error({ type: 'reminder_send_error', error: (err as Error).message });
  }
});

bus.subscribe(EventTypes.INVOICE_REMINDER_DUE_TODAY, async (evt) => {
  try {
    await sendReminder(evt.aggregateId, EventTypes.INVOICE_REMINDER_DUE_TODAY);
  } catch (err) {
    logger.error({ type: 'reminder_send_error', error: (err as Error).message });
  }
});

bus.subscribe(EventTypes.INVOICE_REMINDER_OVERDUE, async (evt) => {
  try {
    await sendReminder(evt.aggregateId, EventTypes.INVOICE_REMINDER_OVERDUE);
  } catch (err) {
    logger.error({ type: 'reminder_send_error', error: (err as Error).message });
  }
});

// Configurable reminder — uses per-config message templates instead of hard-coded ones
type ConfigurableReminderPayload = {
  invoiceId: string;
  configId: string;
  periodDays: number;
  messageTh: string;
  messageEn: string;
  dueDate: string;
};

bus.subscribe('ConfigurableReminder', async (evt) => {
  try {
    const payload = evt.payload as any as ConfigurableReminderPayload;
    const invoice = await prisma.invoice.findUnique({
      where: { id: payload.invoiceId },
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
    const tenant = invoice.room.tenants?.[0]?.tenant;
    const lineUserId = tenant?.lineUserId;
    if (!lineUserId) {
      logger.warn({ type: 'config_reminder_skipped_no_line', invoiceId: payload.invoiceId });
      return;
    }

    const dueDate = new Date(invoice.dueDate).toLocaleDateString('th-TH', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
    const amount = `฿${Number(invoice.totalAmount).toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;

    // Replace template variables
    const daysOverdue = Math.ceil(
      (Date.now() - new Date(invoice.dueDate).getTime()) / (1000 * 60 * 60 * 24)
    );
    const text = payload.messageTh
      .replace(/\{\{roomNo\}\}/g, invoice.roomNo)
      .replace(/\{\{amount\}\}/g, amount)
      .replace(/\{\{dueDate\}\}/g, dueDate)
      .replace(/\{\{daysOverdue\}\}/g, String(Math.max(0, daysOverdue)));

    await sendLineMessage(lineUserId, text);

    logger.info({
      type: 'config_reminder_sent',
      invoiceId: payload.invoiceId,
      configId: payload.configId,
      periodDays: payload.periodDays,
      lineUserId,
    });
  } catch (err) {
    logger.error({ type: 'config_reminder_error', error: (err as Error).message });
  }
});

type ContractExpiringSoonPayload = {
  contractId: string;
  roomNo: string;
  tenantId: string;
  tenantName: string;
  endDate: string;
  daysUntilExpiry: number;
};

async function sendContractExpiryReminder(contractId: string) {
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    include: {
      primaryTenant: true,
    },
  });
  if (!contract || !contract.primaryTenant) return;
  const lineUserId = contract.primaryTenant.lineUserId;
  if (!lineUserId) {
    logger.warn({ type: 'contract_expiry_skipped_no_line', contractId });
    return;
  }
  const daysUntil = Math.ceil(
    (contract.endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );
  const urgent = daysUntil <= 7;
  const text = urgent
    ? `⚠️ ด่วน! สัญญาเช่าห้อง ${contract.roomNo} จะหมดอายุในอีก ${daysUntil} วัน (${contract.endDate.toISOString().split('T')[0]}) กรุณาติดต่อเจ้าหน้าที่เพื่อต่อสัญญา`
    : `📋 สัญญาเช่าห้อง ${contract.roomNo} จะหมดอายุในอีก ${daysUntil} วัน (${contract.endDate.toISOString().split('T')[0]}) กรุณาติดต่อเจ้าหน้าที่เพื่อดำเนินการต่อสัญญา`;
  await sendLineMessage(lineUserId, text);
}

bus.subscribe(EventTypes.CONTRACT_EXPIRING_SOON, async (evt) => {
  try {
    const payload = evt.payload as any as ContractExpiringSoonPayload;
    await sendContractExpiryReminder(payload.contractId);
  } catch (err) {
    logger.error({ type: 'contract_expiry_reminder_error', error: (err as Error).message });
  }
});
