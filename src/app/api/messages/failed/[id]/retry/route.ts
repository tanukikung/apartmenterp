import { NextRequest, NextResponse } from 'next/server';
import { asyncHandler, NotFoundError, type ApiResponse } from '@/lib/utils/errors';
import { prisma } from '@/lib/db/client';
import { requireRole } from '@/lib/auth/guards';
import { sendLineMessage, isLineConfigured } from '@/lib/line/client';
import { logger } from '@/lib/utils/logger';

export const POST = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  requireRole(req, ['ADMIN', 'OWNER']);

  const id = req.nextUrl.pathname.split('/').at(-2);
  if (!id) {
    throw new NotFoundError('Missing message id');
  }

  const failedMessage = await prisma.failedMessage.findUnique({ where: { id } });
  if (!failedMessage) {
    throw new NotFoundError('Failed message not found');
  }

  if (!isLineConfigured()) {
    return NextResponse.json({
      success: false,
      error: { message: 'LINE is not configured', statusCode: 503 },
    }, { status: 503 });
  }

  const payload = failedMessage.payload as { userId?: string; text?: string };
  if (!payload.userId || !payload.text) {
    return NextResponse.json({
      success: false,
      error: { message: 'Payload is missing userId or text', statusCode: 400 },
    }, { status: 400 });
  }

  try {
    await sendLineMessage(payload.userId, payload.text);

    // Increment attempt count and update lastAttemptAt
    await prisma.failedMessage.update({
      where: { id },
      data: {
        attemptCount: { increment: 1 },
        lastAttemptAt: new Date(),
      },
    });

    logger.info({ type: 'failed_message_retry_success', failedMessageId: id });

    return NextResponse.json({
      success: true,
      data: { retried: true, messageId: id },
    } as ApiResponse<{ retried: boolean; messageId: string }>);

  } catch (err) {
    // Increment attempt count and update lastAttemptAt even on failure
    await prisma.failedMessage.update({
      where: { id },
      data: {
        attemptCount: { increment: 1 },
        lastAttemptAt: new Date(),
      },
    });

    logger.error({
      type: 'failed_message_retry_error',
      failedMessageId: id,
      error: err instanceof Error ? err.message : String(err),
    });

    return NextResponse.json({
      success: false,
      error: { message: err instanceof Error ? err.message : 'Retry failed', statusCode: 500 },
    }, { status: 500 });
  }
});
