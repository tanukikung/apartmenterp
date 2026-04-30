import { NextRequest, NextResponse } from 'next/server';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { prisma } from '@/lib/db/client';
import { requireRole } from '@/lib/auth/guards';

export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  requireRole(req, ['ADMIN', 'OWNER']);

  const failedMessages = await prisma.failedMessage.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return NextResponse.json({
    success: true,
    data: { failedMessages },
  } as ApiResponse<{ failedMessages: typeof failedMessages }>);
});
