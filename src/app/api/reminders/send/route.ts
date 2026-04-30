import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth/guards';
import { asyncHandler, ApiResponse, AppError, BadRequestError, NotFoundError } from '@/lib/utils/errors';
import { getOutboxProcessor } from '@/lib/outbox';

import { logger } from '@/lib/utils/logger';
import { logAudit } from '@/modules/audit';
import { prisma } from '@/lib/db/client';
import { isLineConfigured } from '@/lib/line';
import { applyPlainTextTemplateVariables } from '@/lib/templates/document-template';
import { getLoginRateLimiter } from '@/lib/utils/rate-limit';

const ADMIN_WINDOW_MS = 60 * 1000;
const ADMIN_MAX_ATTEMPTS = 20;

// ── POST /api/reminders/send ───────────────────────────────────────────────
// Enqueues a manual reminder outbox event for the given conversation.
// If templateId is supplied, that MessageTemplate body is used.
// If not supplied, the most-recently-updated PAYMENT_REMINDER template is
// looked up automatically so the outbox processor has a real message body.

const schema = z.object({
  conversationId: z.string().min(1),
  text: z.string().min(1),
  /** Optional: ID of a MessageTemplate to use for the reminder body. */
  templateId: z.string().optional(),
});

export const POST = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  const limiter = getLoginRateLimiter();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
  const { allowed, remaining, resetAt } = await limiter.check(`reminder-send:${ip}`, ADMIN_MAX_ATTEMPTS, ADMIN_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: { message: `Too many requests. Try again after ${resetAt.toLocaleTimeString()}.`, code: 'RATE_LIMIT_EXCEEDED', name: 'RateLimitError', statusCode: 429 } },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)), 'X-RateLimit-Remaining': String(remaining) } }
    );
  }
  requireRole(req, ['ADMIN', 'OWNER']);
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
  if (!isLineConfigured()) {
    throw new AppError(
      'LINE messaging is unavailable because credentials are not configured.',
      'LINE_UNAVAILABLE',
      503,
    );
  }

  const conversation = await prisma.conversation.findUnique({
    where: { id: input.conversationId },
  });
  if (!conversation) {
    throw new NotFoundError('Conversation', input.conversationId);
  }
  if (!conversation.lineUserId) {
    throw new BadRequestError('Conversation is not linked to a LINE user');
  }

  // MessageTemplate runtime lookup ─────────────────────────────────────────
  let resolvedBody = input.text;
  let resolvedTemplateId: string | null = null;
  try {
    const msgTemplate = input.templateId
      ? await prisma.messageTemplate.findUnique({ where: { id: input.templateId } })
      : await prisma.messageTemplate.findFirst({
          where: { type: 'PAYMENT_REMINDER' },
          orderBy: { updatedAt: 'desc' },
        });
    if (msgTemplate) {
      resolvedBody = msgTemplate.body;
      resolvedTemplateId = msgTemplate.id;
    }
  } catch {
    // Non-blocking
  }

  // Resolve tenant + room for variable interpolation. Conversation is linked
  // to a room (roomNo); from there we find the primary tenant.
  let tenantFullName = '';
  const roomNumber = conversation.roomNo ?? '';
  if (conversation.roomNo) {
    try {
      const primary = await prisma.roomTenant.findFirst({
        where: { roomNo: conversation.roomNo, role: 'PRIMARY', moveOutDate: null },
        include: { tenant: true },
        orderBy: { createdAt: 'asc' },
      });
      if (primary?.tenant) {
        tenantFullName = `${primary.tenant.firstName ?? ''} ${primary.tenant.lastName ?? ''}`.trim();
      }
    } catch (err) {
      // Non-blocking: tenant name stays blank — log and continue
      logger.warn({ type: 'tenant_resolve_failed', roomNo: conversation.roomNo, error: err instanceof Error ? err.message : String(err) });
    }
  }
  resolvedBody = applyPlainTextTemplateVariables(resolvedBody, {
    tenantName: tenantFullName,
    roomNumber,
  });

  const processor = getOutboxProcessor();
  await processor.writeOne(
    'Conversation',
    input.conversationId,
    'ManualReminderSendRequested',
    {
      conversationId: input.conversationId,
      text: resolvedBody,
      templateId: resolvedTemplateId,
    }
  );

  await logAudit({
    req,
    action: 'REMINDER_SEND_REQUESTED',
    entityType: 'CONVERSATION',
    entityId: input.conversationId,
    metadata: { templateId: resolvedTemplateId },
  });

  logger.info({
    type: 'reminder_send_enqueued',
    conversationId: input.conversationId,
    templateId: resolvedTemplateId,
  });

  return NextResponse.json(
    { success: true, data: { enqueued: true } } as ApiResponse<{ enqueued: boolean }>,
    { status: 202 }
  );
});
