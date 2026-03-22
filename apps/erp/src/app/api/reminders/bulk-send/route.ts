import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth/guards';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { getOutboxProcessor } from '@/lib/outbox';
import type { Json } from '@/types/prisma-json';
import { logger } from '@/lib/utils/logger';
import { logAudit } from '@/modules/audit';
import { prisma } from '@/lib/db/client';

const schema = z.object({
  invoiceIds: z.array(z.string().uuid()).optional(),
  floorNumbers: z.array(z.number()).optional(),
  sendType: z.enum(['OVERDUE', 'DUE_SOON', 'ALL']),
  message: z.string().min(1).optional(),
  templateId: z.string().uuid().optional(),
});

export const POST = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  const session = requireRole(req, ['ADMIN', 'STAFF']);
  const actorId = session.sub;
  const actorRole = session.role;

  const body = await req.json().catch(() => ({}));
  const input = schema.parse(body);

  // Find invoices to send reminders to
  const openStatuses = ['GENERATED', 'SENT', 'VIEWED'] as const;
  const now = new Date();
  const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

  const invoiceWhere: Record<string, unknown> = {
    status: { in: [...openStatuses] },
  };

  if (input.invoiceIds && input.invoiceIds.length > 0) {
    invoiceWhere.id = { in: input.invoiceIds };
  } else if (input.floorNumbers && input.floorNumbers.length > 0) {
    invoiceWhere.room = { floorNo: { in: input.floorNumbers } };
    if (input.sendType === 'OVERDUE') {
      invoiceWhere.dueDate = { lt: now };
    } else if (input.sendType === 'DUE_SOON') {
      invoiceWhere.dueDate = { gte: now, lte: threeDaysFromNow };
    }
  } else if (input.sendType === 'OVERDUE') {
    invoiceWhere.dueDate = { lt: now };
  } else if (input.sendType === 'DUE_SOON') {
    invoiceWhere.dueDate = { gte: now, lte: threeDaysFromNow };
  }

  const invoices = await prisma.invoice.findMany({
    where: invoiceWhere,
    include: {
      room: {
        include: {
          tenants: {
            where: { role: 'PRIMARY', moveOutDate: null },
            include: { tenant: true },
          },
        },
      },
      deliveries: {
        where: { channel: 'LINE' },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });

  // Get message template
  let messageBody = input.message ?? 'แจ้งเตือนค่าบริการ';
  let resolvedTemplateId: string | null = null;

  if (input.templateId) {
    const template = await prisma.messageTemplate.findUnique({
      where: { id: input.templateId },
    });
    if (template) {
      messageBody = template.body;
      resolvedTemplateId = template.id;
    }
  }

  // Get conversations for LINE users
  const lineUserIds = invoices
    .map((inv) => inv.room?.tenants?.[0]?.tenant?.lineUserId)
    .filter(Boolean) as string[];

  const conversations = await prisma.conversation.findMany({
    where: { lineUserId: { in: lineUserIds } },
  });

  const conversationMap = new Map(
    conversations.map((c) => [c.lineUserId, c])
  );

  const processor = getOutboxProcessor();
  const results = { sent: 0, skipped: 0, errors: 0 };

  for (const invoice of invoices) {
    const tenant = invoice.room?.tenants?.[0]?.tenant;
    const lineUserId = tenant?.lineUserId;

    if (!lineUserId) {
      results.skipped++;
      continue;
    }

    const conversation = conversationMap.get(lineUserId);
    if (!conversation) {
      results.skipped++;
      continue;
    }

    // Check cooldown (24 hours)
    const lastDelivery = invoice.deliveries[0];
    if (lastDelivery && lastDelivery.sentAt) {
      const hoursSinceLastSend =
        (now.getTime() - lastDelivery.sentAt.getTime()) / (1000 * 60 * 60);
      if (hoursSinceLastSend < 24) {
        results.skipped++;
        continue;
      }
    }

    try {
      await processor.writeOne(
        'Conversation',
        conversation.id,
        'ManualReminderSendRequested',
        {
          conversationId: conversation.id,
          text: messageBody,
          templateId: resolvedTemplateId,
          metadata: { invoiceId: invoice.id, roomNo: invoice.roomNo },
        } as unknown as Json,
      );
      results.sent++;
    } catch {
      results.errors++;
    }
  }

  await logAudit({
    actorId,
    actorRole,
    action: 'BULK_REMINDER_SEND_REQUESTED',
    entityType: 'INVOICE',
    entityId: 'bulk',
    metadata: {
      invoiceCount: invoices.length,
      sendType: input.sendType,
      results,
    },
  });

  logger.info({
    type: 'bulk_reminder_send',
    actorId,
    sendType: input.sendType,
    results,
  });

  return NextResponse.json({
    success: true,
    data: {
      totalInvoices: invoices.length,
      sent: results.sent,
      skipped: results.skipped,
      errors: results.errors,
    },
  } as ApiResponse<{ totalInvoices: number; sent: number; skipped: number; errors: number }>);
});
