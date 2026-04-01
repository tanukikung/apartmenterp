import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/utils/logger';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { envHealth } from '@/lib/config/env';
import { config } from '@/config';

export const GET = asyncHandler(async () => {
  const envStatus = envHealth();
  let dbStatus: 'connected' | 'degraded' | 'error' = 'degraded';
  let status: 'ok' | 'degraded' | 'error' = 'ok';
  let dbError: string | undefined;
  let dbLatencyMs: number | null = null;

  if (envStatus.status === 'ok') {
    try {
      const t0 = Date.now();
      await prisma.$queryRaw`SELECT 1`;
      dbLatencyMs = Date.now() - t0;
      dbStatus = 'connected';
    } catch (error) {
      dbStatus = 'error';
      status = 'degraded';
      dbError = error instanceof Error ? error.message : 'Unknown error';
      logger.error({
        type: 'prisma_error',
        level: 'error',
        service: 'apartment-erp',
        message: dbError,
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
    version:     config.app.version,
    environment: config.app.env,
    latencies: {
      databaseMs: dbLatencyMs,
    },
    missingEnv: envStatus.missing,
    error:      dbError,
    timestamp:  new Date().toISOString(),
  };

  return NextResponse.json({ success: true, data } as ApiResponse<typeof data>, { status: 200 });
});
