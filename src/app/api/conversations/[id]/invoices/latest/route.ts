import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/guards';
import { asyncHandler, type ApiResponse, NotFoundError } from '@/lib/utils/errors';
import { prisma, logger } from '@/lib';

export const GET = asyncHandler(async (_req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> => {
  requireRole(_req, ['ADMIN', 'STAFF']);
  const { id: conversationId } = params;
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation) {
    throw new NotFoundError('Conversation', conversationId);
  }
  if (!conversation.roomNo) {
    return NextResponse.json(
      { success: true, data: null } as ApiResponse<null>
    );
  }
  const inv = await prisma.invoice.findFirst({
    where: { roomNo: conversation.roomNo },
    orderBy: { createdAt: 'desc' },
    select: { id: true, status: true, dueDate: true, totalAmount: true },
  });
  logger.info({ type: 'latest_invoice_lookup', conversationId, found: Boolean(inv) });
  type LatestInvoice = { id: string; status: string; dueDate: string | null; totalAmount: number };
  const data: LatestInvoice | null = inv
    ? {
        id: inv.id,
        status: String(inv.status),
        dueDate: inv.dueDate ? inv.dueDate.toISOString() : null,
        totalAmount: Number(inv.totalAmount),
      }
    : null;
  return NextResponse.json({ success: true, data } as ApiResponse<LatestInvoice | null>);
});
