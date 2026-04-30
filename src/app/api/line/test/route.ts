import { NextRequest, NextResponse } from 'next/server';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { prisma } from '@/lib/db/client';
import { getEnv } from '@/lib/config/env';
import { requireRole } from '@/lib/auth/guards';
import { logger } from '@/lib';

export const POST = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  requireRole(req, ['ADMIN', 'STAFF', 'OWNER']);

  const env = getEnv();

  // Resolve LINE credentials (env takes priority)
  const channelId = env.LINE_CHANNEL_ID || '';
  const channelSecret = env.LINE_CHANNEL_SECRET || '';
  const accessToken = process.env.LINE_ACCESS_TOKEN || process.env.LINE_CHANNEL_ACCESS_TOKEN || '';

  // Fall back to DB if env not set
  if (!channelId || !channelSecret || !accessToken) {
    const configs = await prisma.config.findMany({
      where: { key: { in: ['line.channelId', 'line.channelSecret', 'line.accessToken'] } },
    });
    const readStr = (key: string) => {
      const found = configs.find((c) => c.key === key);
      return found && typeof found.value === 'string' ? found.value : null;
    };
    const dbChannelId = readStr('line.channelId');
    const dbChannelSecret = readStr('line.channelSecret');
    const dbAccessToken = readStr('line.accessToken');

    if (!channelId && dbChannelId) process.env.LINE_CHANNEL_ID = dbChannelId;
    if (!channelSecret && dbChannelSecret) process.env.LINE_CHANNEL_SECRET = dbChannelSecret;
    if (!accessToken && dbAccessToken) process.env.LINE_ACCESS_TOKEN = dbAccessToken;
  }

  const effectiveChannelId = channelId || process.env.LINE_CHANNEL_ID || '';
  const effectiveChannelSecret = channelSecret || process.env.LINE_CHANNEL_SECRET || '';
  const effectiveAccessToken = accessToken || process.env.LINE_ACCESS_TOKEN || '';

  if (!effectiveChannelId || !effectiveChannelSecret || !effectiveAccessToken) {
    return NextResponse.json(
      {
        success: false,
        error: { name: 'LineCredentialsError', message: 'LINE credentials not configured', code: 'LINE_NOT_CONFIGURED', statusCode: 400 },
        message: 'ยังไม่ได้ตั้งค่า LINE credentials',
      },
      { status: 400 }
    );
  }

  // Test by calling LINE API to validate credentials
  try {
    const response = await fetch('https://api.line.me/v2/profile', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${effectiveAccessToken}`,
      },
    });

    if (!response.ok) {
      const body = await response.text();
      logger.warn(`LINE test failed: ${response.status} ${body}`);
      return NextResponse.json(
        {
          success: false,
          error: { name: 'LineApiError', message: `LINE API error: ${response.status}`, code: 'LINE_API_ERROR', statusCode: response.status },
          message: 'การเชื่อมต่อล้มเหลว — ตรวจสอบ credentials อีกครั้ง',
        },
        { status: 400 }
      );
    }

    const profile = await response.json();
    return NextResponse.json({
      success: true,
      data: { success: true, message: `เชื่อมต่อสำเร็จในนาม ${profile.displayName}` },
    } as ApiResponse<{ success: boolean; message: string }>);
  } catch (err) {
    logger.error({ type: 'LINE_test_error', message: String(err) });
    return NextResponse.json(
      {
        success: false,
        error: { name: 'LineConnectionError', message: 'ไม่สามารถเชื่อมต่อ LINE API', code: 'LINE_CONNECTION_ERROR', statusCode: 500 },
        message: 'ทดสอบการเชื่อมต่อล้มเหลว — ตรวจสอบการเชื่อมต่ออินเทอร์เน็ต',
      },
      { status: 500 }
    );
  }
});