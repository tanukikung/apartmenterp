import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { redisPing, getWorkerHeartbeat, isRedisConfigured } from '@/infrastructure/redis';
import { requireRole } from '@/lib/auth/guards';

// Backup status is tracked by the backup scheduler process, fall back to safe defaults if not available
function getBackupStatus(): { lastAttempt: string | null; lastSuccess: string | null; lastError: string | null; consecutiveFailures: number } {
  return { lastAttempt: null, lastSuccess: null, lastError: null, consecutiveFailures: 0 };
}

export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  // Operator-only: deep health exposes sensitive internal state
  requireRole(req, ['ADMIN']);
  let database: 'connected' | 'error' = 'connected';
  let dbLatencyMs: number | null = null;
  try {
    const t0 = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    dbLatencyMs = Date.now() - t0;
  } catch {
    database = 'error';
  }

  const redisConfigured = isRedisConfigured();
  const tRedis0 = Date.now();
  const redisOk = await redisPing();
  const redisLatencyMs = Date.now() - tRedis0;

  // Redis status: 'ok', 'error', or 'not_configured'
  // 'not_configured' means REDIS_URL is not set (optional component)
  // 'error' means Redis is configured but unreachable
  const redisStatus: 'ok' | 'error' | 'not_configured' =
    !redisConfigured ? 'not_configured' : redisOk ? 'ok' : 'error';

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

  // Determine the actual heartbeat source:
  // - If Redis is configured AND we got a non-null heartbeat from Redis, use 'redis'
  // - Otherwise (Redis not configured OR Redis unreachable), use 'in_memory'
  // This reflects the actual storage mechanism used, not just the configuration flag
  const actualHeartbeatSource: 'redis' | 'in_memory' =
    redisConfigured && hb !== null ? 'redis' : 'in_memory';

  // Determine overall status:
  // - 'error' only if DB is down (required)
  // - 'degraded' if DB is up but worker is not alive (could be worker not running)
  // - 'ok' if DB is up and worker is alive
  // Redis being unavailable is NOT an error if it's not configured
  const overallStatus: 'ok' | 'degraded' | 'error' =
    database === 'error'
      ? 'error'
      : alive
        ? 'ok'
        : 'degraded';

  const backupStatus = getBackupStatus();
  const backupOverallStatus: 'ok' | 'error' | 'degraded' | 'not_configured' =
    !backupStatus.lastAttempt
      ? 'not_configured'
      : backupStatus.lastError
        ? 'error'
        : 'ok';

  const value = {
    status: overallStatus,
    services: {
      database,
      redis: redisStatus === 'ok' ? 'connected' : redisStatus,
      outbox: {
        queueLength: outboxPending,
        failedCount: outboxStuck,
      },
      worker: {
        alive,
        lastHeartbeatMsAgo: hb ? now - hb : null,
        heartbeatSource: actualHeartbeatSource,
      },
      backup: {
        lastAttempt: backupStatus.lastAttempt,
        lastSuccess: backupStatus.lastSuccess,
        lastError: backupStatus.lastError,
      },
    },
    servicesDetailed: {
      database: { status: database === 'connected' ? 'ok' : 'error', latencyMs: dbLatencyMs },
      redis: { status: redisStatus, latencyMs: redisConfigured ? redisLatencyMs : null },
      outbox: { status: outboxStuck > 0 ? 'degraded' : 'ok', queueLength: outboxPending, failedCount: outboxStuck },
      worker: { status: alive ? 'ok' : 'degraded', lastHeartbeatAt, heartbeatSource: actualHeartbeatSource },
      backup: {
        status: backupOverallStatus,
        lastAttempt: backupStatus.lastAttempt,
        lastSuccess: backupStatus.lastSuccess,
        lastError: backupStatus.lastError,
        consecutiveFailures: backupStatus.consecutiveFailures,
      },
    },
    timestamp: new Date().toISOString(),
  };

  return NextResponse.json({ success: true, data: value } as ApiResponse<typeof value>);
});
