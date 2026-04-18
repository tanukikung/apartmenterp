import { getEventBus, logger, sendLineImageMessage, sendLineMessage, sendLineFileMessage, prisma } from '@/lib';
import { applyPlainTextTemplateVariables } from '@/lib/templates/document-template';
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
      await sendLineFileMessage(lineUserId, fileUrl, name || 'document.pdf');
    } else {
      await sendLineMessage(lineUserId, `File: ${name || 'Attachment'}\n${fileUrl}`);
    }

    await prisma.message.update({
      where: { id: messageId },
      data: {
        metadata: {
          status: 'SENT',
        } as any as Prisma.InputJsonValue,
      },
    });

    logger.info({ type: 'line_file_sent', conversationId, messageId, contentType });
  } catch (err) {
    await prisma.message.update({
      where: { id: messageId },
      data: {
        metadata: {
          status: 'FAILED',
          error: err instanceof Error ? err.message : 'Failed to send',
        } as any as Prisma.InputJsonValue,
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
    const payload = (evt as { payload?: LineSendFileRequested })?.payload;
    if (!payload) return;
    await handleFileSend(payload);
  });

  bus.subscribe('InvoiceSendRequested', async (evt: unknown) => {
    const payload = (evt as {
      payload?: {
        invoiceId: string;
        deliveryId?: string | null;
        lineUserId?: string | null;
        pdfUrl: string;
        roomId?: string | null;
        roomNo?: string | null;
        roomNumber?: string | null;
        totalAmount?: number | null;
        dueDate?: string | null;
        templateBody?: string | null;
        interpolationVars?: Record<string, string> | null;
      };
    })?.payload;
    if (!payload) return;

    try {
      let targetLineUserId = payload.lineUserId || null;
      let conversationId: string | null = null;

      const roomLookup = payload.roomId || payload.roomNo;
      if (!targetLineUserId && roomLookup) {
        const conversation = await prisma.conversation.findFirst({ where: { roomNo: roomLookup } });
        targetLineUserId = conversation?.lineUserId || null;
        conversationId = conversation?.id || null;
      }

      if (!targetLineUserId) {
        throw new Error('No LINE recipient resolved for invoice delivery');
      }

      // Build absolute URL for LINE file message (must be publicly accessible)
      const baseUrl = (process.env.APP_BASE_URL || '').replace(/\/+$/, '');
      const absolutePdfUrl = payload.pdfUrl.startsWith('http')
        ? payload.pdfUrl
        : `${baseUrl}${payload.pdfUrl}`;

      const roomLabel = payload.roomNumber || payload.roomNo || 'unknown';
      const fileName = `invoice-${roomLabel}-${payload.dueDate ? new Date(payload.dueDate).toLocaleDateString('th-TH') : 'document'}.pdf`;

      // Send PDF as LINE file attachment
      await sendLineFileMessage(targetLineUserId, absolutePdfUrl, fileName);

      // Build the text message. If a MessageTemplate body is attached, apply
      // variable interpolation ({{tenantName}}, {{roomNumber}}, {{totalAmount}},
      // {{dueDate}}, {{invoiceNumber}}) using the flat vars in the payload.
      // Fall back to a default pipe-separated summary if no template is set.
      let textMessage: string;
      if (payload.templateBody && payload.templateBody.trim().length > 0) {
        textMessage = applyPlainTextTemplateVariables(
          payload.templateBody,
          (payload.interpolationVars as Record<string, string>) || {},
        );
      } else {
        const parts: string[] = ['Invoice sent'];
        if (roomLabel !== 'unknown') parts.push(`Room ${roomLabel}`);
        if (payload.totalAmount != null) parts.push(`Amount ${payload.totalAmount}`);
        if (payload.dueDate) parts.push(`Due ${new Date(payload.dueDate).toLocaleDateString()}`);
        textMessage = parts.join(' | ');
      }
      await sendLineMessage(targetLineUserId, textMessage);

      if (payload.deliveryId) {
        await prisma.invoiceDelivery.update({
          where: { id: payload.deliveryId },
          data: {
            status: 'SENT',
            sentAt: new Date(),
            recipientRef: targetLineUserId,
            errorMessage: null,
          },
        });
      }

      logger.info({
        type: 'invoice_link_sent',
        invoiceId: payload.invoiceId,
        conversationId,
        lineUserId: targetLineUserId,
      });
    } catch (err) {
      if (payload.deliveryId) {
        await prisma.invoiceDelivery.update({
          where: { id: payload.deliveryId },
          data: {
            status: 'FAILED',
            errorMessage: err instanceof Error ? err.message : String(err),
          },
        }).catch(() => undefined);
      }

      logger.error({
        type: 'invoice_link_failed',
        invoiceId: payload.invoiceId,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  });

  bus.subscribe('ReceiptSendRequested', async (evt: unknown) => {
    const payload = (evt as {
      payload?: {
        conversationId: string;
        downloadLink?: string;
        roomNumber?: string;
        amount?: number;
        paidDate?: string;
      };
    })?.payload;
    if (!payload) return;

    try {
      const conversation = await prisma.conversation.findUnique({ where: { id: payload.conversationId } });
      if (!conversation) return;

      const parts: string[] = ['Receipt available'];
      if (payload.roomNumber) parts.push(`Room ${payload.roomNumber}`);
      if (typeof payload.amount === 'number') parts.push(`Amount ${payload.amount}`);
      if (payload.paidDate) parts.push(`Paid ${payload.paidDate}`);
      if (payload.downloadLink) parts.push(payload.downloadLink);

      await sendLineMessage(conversation.lineUserId, parts.join(' | '));
      logger.info({ type: 'receipt_message_sent', conversationId: payload.conversationId });
    } catch (err) {
      logger.error({ type: 'receipt_message_failed', error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  });

  bus.subscribe('ManualReminderSendRequested', async (evt: unknown) => {
    const payload = (evt as { payload?: { conversationId: string; text: string } })?.payload;
    if (!payload) return;

    try {
      const conversation = await prisma.conversation.findUnique({ where: { id: payload.conversationId } });
      if (!conversation) return;
      await sendLineMessage(conversation.lineUserId, payload.text);
      logger.info({ type: 'manual_reminder_sent', conversationId: payload.conversationId });
    } catch (err) {
      logger.error({ type: 'manual_reminder_failed', error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  });

  bus.subscribe('DeliveryOrderItemSendRequested', async (evt: unknown) => {
    const payload = (evt as {
      payload?: {
        itemId: string;
        orderId: string;
        lineUserId: string;
        documentTitle: string;
        roomNo: string;
        pdfUrl: string;
      };
    })?.payload;
    if (!payload) return;

    const { itemId, orderId, lineUserId, documentTitle, roomNo, pdfUrl } = payload;

    const recalculateOrderStatus = async (currentOrderId: string) => {
      const items = await prisma.deliveryOrderItem.findMany({
        where: { deliveryOrderId: currentOrderId },
        select: { status: true },
      });

      const sentCount = items.filter(i => i.status === 'SENT').length;
      const failedCount = items.filter(i => i.status === 'FAILED').length;
      const skippedCount = items.filter(i => i.status === 'SKIPPED').length;
      const pendingCount = items.filter(i => i.status === 'PENDING').length;

      let aggregateStatus: 'COMPLETED' | 'PARTIAL' | 'FAILED' | 'SENDING' = 'SENDING';
      if (pendingCount === 0) {
        if (sentCount === 0 && failedCount > 0) {
          aggregateStatus = 'FAILED';
        } else if (sentCount === items.length) {
          aggregateStatus = 'COMPLETED';
        } else if (sentCount > 0 || skippedCount > 0) {
          aggregateStatus = 'PARTIAL';
        } else {
          aggregateStatus = 'COMPLETED';
        }
      }

      await prisma.deliveryOrder.update({
        where: { id: currentOrderId },
        data: { sentCount, failedCount, status: aggregateStatus },
      });
    };

    try {
      const baseUrl = (process.env.APP_BASE_URL || '').replace(/\/+$/, '');
      const absolutePdfUrl = pdfUrl.startsWith('http') ? pdfUrl : `${baseUrl}${pdfUrl}`;
      const fileName = `${documentTitle}-${roomNo}.pdf`;

      // Provider truth: LINE API returns 200 = accepted by LINE for delivery.
      // No LINE webhook for delivery receipts is currently registered, so this is
      // the best available guarantee. True E2E proof requires LINE Messaging API webhook.
      await sendLineFileMessage(lineUserId, absolutePdfUrl, fileName);

      const item = await prisma.deliveryOrderItem.update({
        where: { id: itemId },
        data: { status: 'SENT', sentAt: new Date(), errorMessage: null },
      });

      if (item.generatedDocumentId) {
        await prisma.generatedDocument.update({
          where: { id: item.generatedDocumentId },
          data: { status: 'SENT' },
        }).catch(() => undefined);
      }

      await recalculateOrderStatus(orderId);

      logger.info({ type: 'delivery_order_item_sent', itemId, orderId, lineUserId });
    } catch (err) {
      await prisma.deliveryOrderItem.update({
        where: { id: itemId },
        data: {
          status: 'FAILED',
          errorMessage: err instanceof Error ? err.message : String(err),
        },
      }).catch(() => undefined);

      await recalculateOrderStatus(orderId);

      logger.error({
        type: 'delivery_order_item_send_failed',
        itemId,
        orderId,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  });
}
