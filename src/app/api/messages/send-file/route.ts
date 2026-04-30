import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth/guards';
import { asyncHandler, ApiResponse, AppError } from '@/lib/utils/errors';
import { logger } from '@/lib';
import { isLineConfigured } from '@/lib/line';
import { queueConversationFileSend } from '@/modules/messaging/file-send.service';
import { getLoginRateLimiter } from '@/lib/utils/rate-limit';

const FILE_SEND_WINDOW_MS = 60 * 1000;
const FILE_SEND_MAX_ATTEMPTS = 5;

const schema = z.object({
  conversationId: z.string().min(1),
  fileId: z.string().min(1),
  name: z.string().min(1).optional(),
  contentType: z.string().optional(),
});

export const POST = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  const limiter = getLoginRateLimiter();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
  const { allowed, remaining, resetAt } = await limiter.check(`file-send:${ip}`, FILE_SEND_MAX_ATTEMPTS, FILE_SEND_WINDOW_MS);
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
