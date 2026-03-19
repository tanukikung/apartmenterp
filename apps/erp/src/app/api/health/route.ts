import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/utils/logger';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { envHealth } from '@/lib/config/env';
import { config } from '@/config';

async function checkOnlyOffice(): Promise<'ready' | 'unavailable' | 'not_configured'> {
  const url = (process.env.ONLYOFFICE_DOCUMENT_SERVER_URL || '').trim();
  if (!url) return 'not_configured';
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${url.replace(/\/+$/, '')}/healthcheck`, {
      signal: controller.signal,
      cache: 'no-store',
    });
    clearTimeout(timer);
    return res.ok ? 'ready' : 'unavailable';
  } catch {
    return 'unavailable';
  }
}

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

  // OnlyOffice is optional — degraded status does not affect overall health
  const onlyofficeStatus = await checkOnlyOffice();

  const services = {
    database:    dbStatus,
    env:         envStatus.status,
    app:         'ok' as const,
    onlyoffice:  onlyofficeStatus,
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
