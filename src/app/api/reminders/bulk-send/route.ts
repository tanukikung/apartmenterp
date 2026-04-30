import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth/guards';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { getOutboxProcessor } from '@/lib/outbox';
import { logger } from '@/lib/utils/logger';
import { logAudit } from '@/modules/audit';
import { prisma } from '@/lib/db/client';
import { applyPlainTextTemplateVariables } from '@/lib/templates/document-template';
import { getLoginRateLimiter } from '@/lib/utils/rate-limit';

const CHAT_WINDOW_MS = 60 * 1000;
const CHAT_MAX_ATTEMPTS = 20;

const schema = z.object({
  invoiceIds: z.array(z.string().uuid()).optional(),
  floorNumbers: z.array(z.number()).optional(),
  sendType: z.enum(['OVERDUE', 'DUE_SOON', 'ALL']),
  message: z.string().min(1).optional(),
  templateId: z.string().uuid().optional(),
});

export const POST = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  const limiter = getLoginRateLimiter();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
  const { allowed, remaining, resetAt } = await limiter.check(`reminder-bulk-send:${ip}`, CHAT_MAX_ATTEMPTS, CHAT_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: { message: `Too many requests. Try again after ${resetAt.toLocaleTimeString()}.`, code: 'RATE_LIMIT_EXCEEDED', name: 'RateLimitError', statusCode: 429 } },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)), 'X-RateLimit-Remaining': String(remaining) } }
    );
  }
  const session = requireRole(req, ['ADMIN', 'STAFF', 'OWNER']);
  const actorId = session.sub;
  const actorRole = session.role;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: { message: 'Invalid JSON body', statusCode: 400, name: 'ParseError', code: 'INVALID_JSON' } },
      { status: 400 }
    );
  }
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
    take: 500, // cap to prevent unbounded memory usage
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
      const tenantFullName = tenant
        ? `${tenant.firstName ?? ''} ${tenant.lastName ?? ''}`.trim()
        : '';
      const invoiceNumber = `INV-${invoice.year}${String(invoice.month).padStart(2, '0')}-${invoice.roomNo}`;
      const personalisedText = applyPlainTextTemplateVariables(messageBody, {
        tenantName: tenantFullName,
        roomNumber: invoice.roomNo,
        invoiceNumber,
        year: String(invoice.year),
        month: String(invoice.month).padStart(2, '0'),
        totalAmount: Number(invoice.totalAmount).toLocaleString('th-TH', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }),
        dueDate: invoice.dueDate
          ? invoice.dueDate.toLocaleDateString('th-TH', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })
          : '',
      });

      await processor.writeOne(
        'Conversation',
        conversation.id,
        'ManualReminderSendRequested',
        {
          conversationId: conversation.id,
          text: personalisedText,
          templateId: resolvedTemplateId,
          metadata: { invoiceId: invoice.id, roomNo: invoice.roomNo },
        },
      );
      results.sent++;
    } catch (err) {
      results.errors++;
      logger.warn({ type: 'bulk_reminder_send_failed', invoiceId: invoice.id, roomNo: invoice.roomNo, error: err instanceof Error ? err.message : String(err) });
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
