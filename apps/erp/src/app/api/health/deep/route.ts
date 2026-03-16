import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { redisPing, getWorkerHeartbeat } from '@/infrastructure/redis';

export const GET = asyncHandler(async (): Promise<NextResponse> => {
  let database: 'connected' | 'error' = 'connected';
  let dbLatencyMs: number | null = null;
  try {
    const t0 = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    dbLatencyMs = Date.now() - t0;
  } catch {
    database = 'error';
  }

  const tRedis0 = Date.now();
  const redisOk = await redisPing();
  const redisLatencyMs = Date.now() - tRedis0;
  let outboxPending = 0;
  let outboxStuck = 0;
  try {
    outboxPending = await prisma.outboxEvent.count({ where: { processedAt: null } });
    outboxStuck = await prisma.outboxEvent.count({
      where: { processedAt: null, retryCount: { gte: 3 } },
    });
  } catch {
    outboxPending = 0;
    outboxStuck = 0;
  }

  const hb = await getWorkerHeartbeat();
  const now = Date.now();
  const alive = !!hb && now - hb < 20000;
  const lastHeartbeatAt = hb ? new Date(hb).toISOString?.() ?? null : null;

  const value = {
    status:
      database === 'connected' && redisOk && alive ? 'ok' : database === 'error' || !redisOk ? 'error' : 'degraded',
    services: {
      database,
      redis: redisOk ? 'connected' : 'error',
      outbox: {
        queueLength: outboxPending,
        failedCount: outboxStuck,
      },
      worker: {
        alive,
        lastHeartbeatMsAgo: hb ? now - hb : null,
      },
    },
    servicesDetailed: {
      database: { status: database === 'connected' ? 'ok' : 'error', latencyMs: dbLatencyMs },
      redis: { status: redisOk ? 'ok' : 'error', latencyMs: redisLatencyMs },
      outbox: { status: outboxStuck > 0 ? 'degraded' : 'ok', queueLength: outboxPending, failedCount: outboxStuck },
      worker: { status: alive ? 'ok' : 'degraded', lastHeartbeatAt },
    },
    timestamp: new Date().toISOString(),
  };

  return NextResponse.json({ success: true, data: value } as ApiResponse<typeof value>);
});
