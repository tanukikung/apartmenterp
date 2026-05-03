/**
 * DLQ single-event retry
 *
 * POST /api/admin/messaging/dlq/:id/retry
 *   Body: { type: "inbox" | "outbox", acknowledgeOutboxRisk?: boolean }
 *
 * Resets the event to PENDING (inbox) or clears processedAt (outbox)
 * so the next processor poll picks it up immediately.
 *
 * Safety: outbox retry requires acknowledgeOutboxRisk: true because
 * resetting processedAt can cause a duplicate LINE message if the
 * original publish succeeded before the server crashed.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { asyncHandler } from '@/lib/utils/errors';
import { requireRole } from '@/lib/auth/guards';
import { logger } from '@/lib/utils/logger';

export const dynamic = 'force-dynamic';

export const POST = asyncHandler(
  async (req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> => {
    requireRole(req, ['ADMIN', 'OWNER']);

    const { id } = params;
    const body = await req.json() as {
      type:                 'inbox' | 'outbox';
      acknowledgeOutboxRisk?: boolean;
    };
    const { type, acknowledgeOutboxRisk = false } = body;

    if (type !== 'inbox' && type !== 'outbox') {
      return NextResponse.json({ success: false, error: 'type must be inbox or outbox' }, { status: 400 });
    }
    if (type === 'outbox' && !acknowledgeOutboxRisk) {
      return NextResponse.json({
        success: false,
        error:   'Retrying an outbox event may deliver a duplicate LINE message. Pass acknowledgeOutboxRisk: true to proceed.',
        code:    'OUTBOX_RETRY_RISK',
      }, { status: 409 });
    }

    if (type === 'inbox') {
      const event = await prisma.inboxEvent.findUnique({ where: { id } });
      if (!event) {
        return NextResponse.json({ success: false, error: 'InboxEvent not found' }, { status: 404 });
      }
      if (event.status !== 'DEAD') {
        return NextResponse.json({
          success: false,
          error:   `Event is in status ${event.status}, not DEAD. Only DEAD events can be retried.`,
        }, { status: 409 });
      }

      await prisma.inboxEvent.update({
        where: { id },
        data:  {
          status:       'PENDING',
          retryCount:   0,
          nextRetryAt:  null,
          lastError:    null,
          errorCode:    null,
          lastFailedAt: null,
        },
      });

      logger.info({ type: 'dlq_single_retry', queue: 'inbox', id, eventId: event.eventId });

      return NextResponse.json({
        success: true,
        message: `InboxEvent ${id} reset to PENDING`,
        data:    { id, queue: 'inbox', status: 'PENDING' },
      });

    } else {
      const event = await prisma.outboxEvent.findUnique({ where: { id } });
      if (!event) {
        return NextResponse.json({ success: false, error: 'OutboxEvent not found' }, { status: 404 });
      }
      if (!event.lastError?.startsWith('DEAD_LETTER')) {
        return NextResponse.json({
          success: false,
          error:   `Event lastError does not start with DEAD_LETTER. Only dead-lettered outbox events can be retried.`,
        }, { status: 409 });
      }

      await prisma.outboxEvent.update({
        where: { id },
        data:  {
          processedAt:  null,
          retryCount:   0,
          nextRetryAt:  null,
          lastError:    null,
          errorCode:    null,
          lastFailedAt: null,
        },
      });

      logger.info({
        type: 'dlq_single_retry', queue: 'outbox', id,
        eventType: event.eventType, aggregateId: event.aggregateId,
      });

      return NextResponse.json({
        success: true,
        message: `OutboxEvent ${id} reset for re-delivery`,
        data:    { id, queue: 'outbox', status: 'PENDING' },
      });
    }
  },
);
