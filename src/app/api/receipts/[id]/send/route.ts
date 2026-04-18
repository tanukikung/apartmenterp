import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getVerifiedActor, requireRole } from '@/lib/auth/guards';
import { asyncHandler, ApiResponse, AppError, BadRequestError, NotFoundError } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import { getOutboxProcessor } from '@/lib/outbox';
import { buildInvoiceAccessUrl } from '@/lib/invoices/access';

import { logAudit } from '@/modules/audit';
import { prisma } from '@/lib/db/client';
import { isLineConfigured } from '@/lib/line';

const schema = z.object({
  conversationId: z.string().min(1),
  downloadLink: z.string().url().optional(),
  roomNumber: z.string().optional(),
  amount: z.number().optional(),
  paidDate: z.string().optional(),
});

function normalizeReceiptDownloadLink(receiptId: string, requestedLink?: string): string | undefined {
  const baseUrl = (process.env.APP_BASE_URL || '').trim();
  const signedInvoiceLink = buildInvoiceAccessUrl(receiptId, {
    absoluteBaseUrl: baseUrl,
    signed: true,
  });

  if (!requestedLink) {
    return signedInvoiceLink;
  }

  try {
    const resolved = new URL(requestedLink, baseUrl || 'http://local');
    const pluralPath = `/api/invoices/${encodeURIComponent(receiptId)}/pdf`;
    const singularPath = `/api/invoice/${encodeURIComponent(receiptId)}/pdf`;
    if (resolved.pathname === pluralPath || resolved.pathname === singularPath) {
      return signedInvoiceLink;
    }
  } catch {
    return requestedLink;
  }

  return requestedLink;
}

export const POST = asyncHandler(
  async (req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> => {
    requireRole(req, ['ADMIN', 'STAFF']);
    const { id } = params;
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
    const downloadLink = normalizeReceiptDownloadLink(id, input.downloadLink);

    const processor = getOutboxProcessor();
    await processor.writeOne(
      'Receipt',
      id,
      'ReceiptSendRequested',
      {
        receiptId: id,
        conversationId: input.conversationId,
        downloadLink,
        roomNumber: input.roomNumber,
        amount: input.amount,
        paidDate: input.paidDate,
      }
    );

    await logAudit({
      actorId: actor.actorId,
      actorRole: actor.actorRole,
      action: 'RECEIPT_SEND_REQUESTED',
      entityType: 'RECEIPT',
      entityId: id,
      metadata: { conversationId: input.conversationId, downloadLink },
    });

    logger.info({ type: 'receipt_send_enqueued', receiptId: id });

    return NextResponse.json({ success: true, data: { receiptId: id } } as ApiResponse<{ receiptId: string }>, { status: 202 });
  }
);
