import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth/guards';
import { asyncHandler, type ApiResponse, AppError } from '@/lib/utils/errors';
import { logger } from '@/lib';
import { isLineConfigured } from '@/lib/line';
import { queueConversationFileSend } from '@/modules/messaging/file-send.service';

const schema = z.object({
  fileId: z.string().uuid(),
});

export const POST = asyncHandler(async (req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> => {
  requireRole(req, ['ADMIN', 'STAFF']);
  const { id: conversationId } = params;
  const body = await req.json().catch(() => ({}));
  const input = schema.parse(body);
  if (!isLineConfigured()) {
    throw new AppError(
      'LINE messaging is unavailable because credentials are not configured.',
      'LINE_UNAVAILABLE',
      503,
    );
  }

  const message = await queueConversationFileSend({
    conversationId,
    fileId: input.fileId,
  });

  logger.info({
    type: 'chat_file_send_enqueued',
    conversationId,
    messageId: message.id,
    fileId: input.fileId,
  });

  return NextResponse.json({ success: true, data: { messageId: message.id } } as ApiResponse<{ messageId: string }>, { status: 202 });
});
