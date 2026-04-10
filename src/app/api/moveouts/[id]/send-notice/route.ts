import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { createMoveOutService } from '@/modules/moveouts';
import { sendMoveOutNoticeSchema } from '@/modules/moveouts/types';
import { asyncHandler, ApiResponse, ConflictError } from '@/lib/utils/errors';
import { requireRole } from '@/lib/auth/guards';
import { logger, prisma, isLineConfigured } from '@/lib';
import { getOutboxProcessor } from '@/lib/outbox';
import type { Json } from '@/types/prisma-json';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: { id: string };
}

// ============================================================================
// POST /api/moveouts/[id]/send-notice - Send move-out notice via LINE
// ============================================================================

export const POST = asyncHandler(async (req: NextRequest, { params }: RouteParams): Promise<NextResponse> => {
  requireRole(req, ['ADMIN', 'STAFF']);
  const body = await req.json().catch(() => ({}));
  const input = sendMoveOutNoticeSchema.parse(body);

  // Check if LINE is configured
  if (!isLineConfigured()) {
    throw new ConflictError('LINE messaging is not configured');
  }

  const moveOutService = createMoveOutService();
  const moveOut = await moveOutService.getMoveOutById(params.id);

  if (!moveOut.contract?.primaryTenant?.lineUserId) {
    throw new ConflictError('Tenant does not have a LINE account linked');
  }

  // Find or create conversation for this tenant
  let conversation = await prisma.conversation.findFirst({
    where: {
      lineUserId: moveOut.contract.primaryTenant.lineUserId,
      status: 'ACTIVE',
    },
  });

  if (!conversation) {
    // Create a new conversation
    conversation = await prisma.conversation.create({
      data: {
        id: uuidv4(),
        lineUserId: moveOut.contract.primaryTenant.lineUserId,
        tenantId: moveOut.contract.primaryTenant.id,
        roomNo: moveOut.contract.roomNo,
        lastMessageAt: new Date(),
        unreadCount: 0,
        status: 'ACTIVE',
      },
    });
  }

  // Default message if not provided
  const defaultMessage = `🏠 Move-out Notice

Dear ${moveOut.contract.primaryTenant.fullName},

This is to notify you that your move-out from Room ${moveOut.contract.roomNo} has been processed.

📅 Move-out Date: ${new Date(moveOut.moveOutDate).toLocaleDateString('th-TH')}

💰 Deposit Summary:
- Original Deposit: ${moveOut.depositAmount.toLocaleString('th-TH')} ฿
- Total Deductions: ${moveOut.totalDeduction.toLocaleString('th-TH')} ฿
- Final Refund: ${moveOut.finalRefund.toLocaleString('th-TH')} ฿

Status: ${moveOut.status}

If you have any questions, please contact us.`;

  const messageText = input.message || defaultMessage;

  // Write to outbox for processing
  const processor = getOutboxProcessor();
  await processor.writeOne(
    'Conversation',
    conversation.id,
    'MoveOutNoticeRequested',
    {
      conversationId: conversation.id,
      text: messageText,
      moveOutId: moveOut.id,
      tenantId: moveOut.contract.primaryTenant.id,
      roomNo: moveOut.contract.roomNo,
    } as unknown as Json,
  );

  // Update lineNoticeSentAt timestamp
  await prisma.moveOut.update({
    where: { id: params.id },
    data: { lineNoticeSentAt: new Date() },
  });

  logger.info({
    type: 'moveout_notice_sent_api',
    moveOutId: params.id,
    conversationId: conversation.id,
  });

  return NextResponse.json({
    success: true,
    data: {
      moveOutId: params.id,
      conversationId: conversation.id,
      messageSent: messageText,
    },
    message: 'Move-out notice queued for sending',
  } as ApiResponse<{
    moveOutId: string;
    conversationId: string;
    messageSent: string;
  }>, { status: 202 });
});
