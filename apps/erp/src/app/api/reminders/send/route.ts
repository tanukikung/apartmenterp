import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getVerifiedActor, requireRole } from '@/lib/auth/guards';
import { asyncHandler, ApiResponse, AppError, BadRequestError, NotFoundError } from '@/lib/utils/errors';
import { getOutboxProcessor } from '@/lib/outbox';
import type { Json } from '@/types/prisma-json';
import { logger } from '@/lib/utils/logger';
import { logAudit } from '@/modules/audit';
import { prisma } from '@/lib/db/client';
import { isLineConfigured } from '@/lib/line';

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
  requireRole(req, ['ADMIN']);
  const body = await req.json().catch(() => ({}));
  const input = schema.parse(body);
  const actor = getVerifiedActor(req);
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

  const processor = getOutboxProcessor();
  await processor.writeOne(
    'Conversation',
    input.conversationId,
    'ManualReminderSendRequested',
    {
      conversationId: input.conversationId,
      text: resolvedBody,
      templateId: resolvedTemplateId,
    } as unknown as Json
  );

  await logAudit({
    actorId: actor.actorId,
    actorRole: actor.actorRole,
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
