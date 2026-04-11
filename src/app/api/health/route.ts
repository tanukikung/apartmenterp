import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/utils/logger';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { envHealth } from '@/lib/config/env';

export const GET = asyncHandler(async () => {
  const envStatus = envHealth();
  let dbStatus: 'connected' | 'degraded' | 'error' = 'degraded';
  let status: 'ok' | 'degraded' | 'error' = 'ok';

  if (envStatus.status === 'ok') {
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbStatus = 'connected';
    } catch (error) {
      dbStatus = 'error';
      status = 'degraded';
      logger.error({
        type: 'prisma_error',
        level: 'error',
        service: 'apartment-erp',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  } else {
    status = 'degraded';
    dbStatus = 'degraded';
  }

  const services = {
    database:    dbStatus,
    env:         envStatus.status,
    app:         'ok' as const,
  };

  const data = {
    status,
    services,
    timestamp: new Date().toISOString(),
  };

  return NextResponse.json({ success: true, data } as ApiResponse<typeof data>, { status: 200 });
});
