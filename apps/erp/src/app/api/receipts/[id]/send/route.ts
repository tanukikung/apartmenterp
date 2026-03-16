import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import { getOutboxProcessor } from '@/lib/outbox';
import type { Json } from '@/types/prisma-json';
import { logAudit } from '@/modules/audit';

const schema = z.object({
  conversationId: z.string().uuid(),
  downloadLink: z.string().url().optional(),
  roomNumber: z.string().optional(),
  amount: z.number().optional(),
  paidDate: z.string().optional(),
});

export const POST = asyncHandler(
  async (req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> => {
    const { id } = params;
    const body = await req.json().catch(() => ({}));
    const input = schema.parse(body);

    const processor = getOutboxProcessor();
    await processor.writeOne(
      'Receipt',
      id,
      'ReceiptSendRequested',
      {
        receiptId: id,
        conversationId: input.conversationId,
        downloadLink: input.downloadLink,
        roomNumber: input.roomNumber,
        amount: input.amount,
        paidDate: input.paidDate,
      } as unknown as Json
    );

    await logAudit({
      actorId: 'system',
      actorRole: 'ADMIN',
      action: 'RECEIPT_SEND_REQUESTED',
      entityType: 'RECEIPT',
      entityId: id,
      metadata: { conversationId: input.conversationId, downloadLink: input.downloadLink },
    });

    logger.info({ type: 'receipt_send_enqueued', receiptId: id });

    return NextResponse.json({ success: true, data: { receiptId: id } } as ApiResponse<{ receiptId: string }>, { status: 202 });
  }
);
