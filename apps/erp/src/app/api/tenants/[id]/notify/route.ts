import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getVerifiedActor } from '@/lib/auth/guards';
import { asyncHandler, ApiResponse, ConflictError, NotFoundError } from '@/lib/utils/errors';
import { getOutboxProcessor } from '@/lib/outbox';
import { logAudit } from '@/modules/audit';
import { logger, prisma } from '@/lib';
import type { Json } from '@/types/prisma-json';

const schema = z.object({
  type: z.literal('overdue_reminder').default('overdue_reminder'),
});

export const POST = asyncHandler(
  async (
    req: NextRequest,
    { params }: { params: { id: string } },
  ): Promise<NextResponse> => {
    const body = await req.json().catch(() => ({}));
    const input = schema.parse(body);
    const actor = getVerifiedActor(req);

    const tenant = await prisma.tenant.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        lineUserId: true,
        roomTenants: {
          where: {
            role: 'PRIMARY',
            moveOutDate: null,
          },
          select: {
            room: {
              select: {
                roomNo: true,
              },
            },
          },
          take: 1,
        },
      },
    });

    if (!tenant) {
      throw new NotFoundError('Tenant', params.id);
    }

    const activeRoom = tenant.roomTenants[0]?.room ?? null;
    const conversation = await prisma.conversation.findFirst({
      where: {
        status: 'ACTIVE',
        OR: [
          { tenantId: tenant.id },
          ...(tenant.lineUserId ? [{ lineUserId: tenant.lineUserId }] : []),
          ...(activeRoom?.roomNo ? [{ roomNo: activeRoom.roomNo }] : []),
        ],
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (!conversation) {
      throw new ConflictError('No active conversation linked to this tenant');
    }

    let text = activeRoom
      ? `Overdue reminder for Room ${activeRoom.roomNo}: please review your unpaid invoices and settle payment as soon as possible.`
      : 'Overdue reminder: please review your unpaid invoices and settle payment as soon as possible.';
    let templateId: string | null = null;

    try {
      const template =
        (await prisma.messageTemplate.findFirst({
          where: { type: 'OVERDUE_NOTICE' },
          orderBy: { updatedAt: 'desc' },
        })) ??
        (await prisma.messageTemplate.findFirst({
          where: { type: 'PAYMENT_REMINDER' },
          orderBy: { updatedAt: 'desc' },
        }));

      if (template) {
        text = template.body;
        templateId = template.id;
      }
    } catch {
      // Non-blocking: fall back to the default reminder body.
    }

    const processor = getOutboxProcessor();
    await processor.writeOne(
      'Conversation',
      conversation.id,
      'ManualReminderSendRequested',
      {
        conversationId: conversation.id,
        text,
        templateId,
        reminderType: input.type,
      } as unknown as Json,
    );

    await logAudit({
      actorId: actor.actorId,
      actorRole: actor.actorRole,
      action: 'REMINDER_SEND_REQUESTED',
      entityType: 'CONVERSATION',
      entityId: conversation.id,
      metadata: {
        tenantId: tenant.id,
        templateId,
        reminderType: input.type,
        source: 'TENANT_NOTIFY',
      },
    });

    logger.info({
      type: 'tenant_notify_enqueued',
      tenantId: tenant.id,
      conversationId: conversation.id,
      templateId,
      reminderType: input.type,
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          enqueued: true,
          conversationId: conversation.id,
        },
      } as ApiResponse<{ enqueued: boolean; conversationId: string }>,
      { status: 202 },
    );
  },
);
