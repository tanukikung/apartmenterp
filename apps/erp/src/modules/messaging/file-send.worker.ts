import { getEventBus, logger, sendLineImageMessage, sendLineMessage, prisma } from '@/lib';
import type { Prisma } from '@prisma/client';

let registered = false;

type LineSendFileRequested = {
  conversationId: string;
  messageId: string;
  lineUserId: string;
  fileUrl: string;
  contentType: string;
  name?: string;
};

async function handleFileSend(payload: LineSendFileRequested): Promise<void> {
  const { conversationId, messageId, lineUserId, fileUrl, contentType, name } = payload;
  try {
    if (contentType.startsWith('image/')) {
      await sendLineImageMessage(lineUserId, fileUrl);
    } else if (contentType === 'application/pdf') {
      const text = `📄 ${name || 'Document'}\n${fileUrl}`;
      await sendLineMessage(lineUserId, text);
    } else {
      const text = `📎 ${name || 'File'}\n${fileUrl}`;
      await sendLineMessage(lineUserId, text);
    }
    await prisma.message.update({
      where: { id: messageId },
      data: {
        metadata: {
          status: 'SENT',
        } as unknown as Prisma.InputJsonValue,
      },
    });
    logger.info({
      type: 'line_file_sent',
      conversationId,
      messageId,
      contentType,
    });
  } catch (err) {
    await prisma.message.update({
      where: { id: messageId },
      data: {
        metadata: {
          status: 'FAILED',
          error: err instanceof Error ? err.message : 'Failed to send',
        } as unknown as Prisma.InputJsonValue,
      },
    });
    logger.error({
      type: 'line_file_send_failed',
      conversationId,
      messageId,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

export function registerFileSendWorker(options?: { allowInTest?: boolean }): void {
  if (process.env.NODE_ENV === 'test' && !options?.allowInTest) return;
  if (registered) return;
  registered = true;
  const bus = getEventBus();
  bus.subscribe('LineSendFileRequested', async (evt: unknown) => {
    const e = evt as { payload?: unknown };
    const p = (e && (e as { payload?: unknown }).payload) as LineSendFileRequested | undefined;
    if (!p) return;
    await handleFileSend(p);
  });
  
  bus.subscribe('InvoiceSendRequested', async (evt: unknown) => {
    const e = evt as { payload?: unknown };
    const p = (e && (e as { payload?: unknown }).payload) as {
      invoiceId: string;
      pdfUrl: string;
      roomId?: string | null;
      roomNumber?: string | null;
      totalAmount?: number | null;
      dueDate?: string | null;
    } | undefined;
    if (!p) return;
    try {
      let conversation = null as Awaited<ReturnType<typeof prisma.conversation.findFirst>> | null;
      if (p.roomId) {
        conversation = await prisma.conversation.findFirst({ where: { roomId: p.roomId } });
      }
      if (!conversation) {
        conversation = await prisma.conversation.findFirst({ orderBy: { lastMessageAt: 'desc' } });
      }
      if (!conversation) return;
      const lines: string[] = ['🧾 Invoice available'];
      if (p.roomNumber) lines.push(`Room ${p.roomNumber}`);
      if (p.totalAmount != null) lines.push(`Amount ${p.totalAmount}`);
      if (p.dueDate) lines.push(`Due ${new Date(p.dueDate).toLocaleDateString()}`);
      lines.push(p.pdfUrl);
      await sendLineMessage(conversation.lineUserId, lines.join(' • '));
      logger.info({ type: 'invoice_link_sent', invoiceId: p.invoiceId, conversationId: conversation.id });
    } catch (err) {
      logger.error({ type: 'invoice_link_failed', invoiceId: p?.invoiceId, error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  });
  
  bus.subscribe('ReceiptSendRequested', async (evt: unknown) => {
    const e = evt as { payload?: unknown };
    const p = (e && (e as { payload?: unknown }).payload) as {
      conversationId: string;
      downloadLink?: string;
      roomNumber?: string;
      amount?: number;
      paidDate?: string;
    } | undefined;
    if (!p) return;
    try {
      const conversation = await prisma.conversation.findUnique({ where: { id: p.conversationId } });
      if (!conversation) return;
      const parts: string[] = ['Receipt available'];
      if (p.roomNumber) parts.push(`Room ${p.roomNumber}`);
      if (typeof p.amount === 'number') parts.push(`Amount ${p.amount}`);
      if (p.paidDate) parts.push(`Paid ${p.paidDate}`);
      if (p.downloadLink) parts.push(p.downloadLink);
      await sendLineMessage(conversation.lineUserId, parts.join(' • '));
      logger.info({ type: 'receipt_message_sent', conversationId: p.conversationId });
    } catch (err) {
      logger.error({ type: 'receipt_message_failed', error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  });
  
  bus.subscribe('ManualReminderSendRequested', async (evt: unknown) => {
    const e = evt as { payload?: unknown };
    const p = (e && (e as { payload?: unknown }).payload) as { conversationId: string; text: string } | undefined;
    if (!p) return;
    try {
      const conversation = await prisma.conversation.findUnique({ where: { id: p.conversationId } });
      if (!conversation) return;
      await sendLineMessage(conversation.lineUserId, p.text);
      logger.info({ type: 'manual_reminder_sent', conversationId: p.conversationId });
    } catch (err) {
      logger.error({ type: 'manual_reminder_failed', error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  });
}
