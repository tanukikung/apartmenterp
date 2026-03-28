import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth/guards';
import { asyncHandler, ApiResponse, AppError } from '@/lib/utils/errors';
import { logger } from '@/lib';
import { isLineConfigured } from '@/lib/line';
import { queueConversationFileSend } from '@/modules/messaging/file-send.service';

const schema = z.object({
  conversationId: z.string().min(1),
  fileId: z.string().min(1),
  name: z.string().min(1).optional(),
  contentType: z.string().optional(),
});

export const POST = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  requireRole(req, ['ADMIN', 'STAFF']);
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
    conversationId: input.conversationId,
    fileId: input.fileId,
    name: input.name,
    contentType: input.contentType,
  });

  logger.info({
    type: 'chat_file_send_enqueued',
    conversationId: input.conversationId,
    messageId: message.id,
    fileId: input.fileId,
  });

  return NextResponse.json({ success: true, data: message } as ApiResponse<typeof message>, { status: 202 });
});
