import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { createMoveOutService } from '@/modules/moveouts';
import { sendMoveOutNoticeSchema } from '@/modules/moveouts/types';
import { asyncHandler, ApiResponse, ConflictError } from '@/lib/utils/errors';
import { requireRole } from '@/lib/auth/guards';
import { logger, prisma, isLineConfigured } from '@/lib';
import { getOutboxProcessor } from '@/lib/outbox';
import { getLoginRateLimiter } from '@/lib/utils/rate-limit';

const CHAT_WINDOW_MS = 60 * 1000;
const CHAT_MAX_ATTEMPTS = 20;


export const dynamic = 'force-dynamic';

interface RouteParams {
  params: { id: string };
}

// ============================================================================
// POST /api/moveouts/[id]/send-notice - Send move-out notice via LINE
// ============================================================================

export const POST = asyncHandler(async (req: NextRequest, { params }: RouteParams): Promise<NextResponse> => {
  const limiter = getLoginRateLimiter();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
  const { allowed, remaining, resetAt } = await limiter.check(`moveouts-send-notice:${ip}`, CHAT_MAX_ATTEMPTS, CHAT_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: { message: `Too many requests. Try again after ${resetAt.toLocaleTimeString()}.`, code: 'RATE_LIMIT_EXCEEDED', name: 'RateLimitError', statusCode: 429 } },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)), 'X-RateLimit-Remaining': String(remaining) } }
    );
  }
  requireRole(req, ['ADMIN', 'STAFF', 'OWNER']);
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: { message: 'Invalid JSON body', statusCode: 400, name: 'ParseError', code: 'INVALID_JSON' } },
      { status: 400 }
    );
  }
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
    },
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
