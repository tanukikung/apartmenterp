import { prisma } from '@/lib/db';
import { redisPing, getWorkerHeartbeat } from '@/infrastructure/redis';
import { logger } from '@/lib/utils/logger';

export interface AlertDeps {
  dbOk?: () => Promise<boolean>;
  outboxFailedCount?: () => Promise<number>;
  workerAlive?: (now: number) => Promise<{ alive: boolean; lastHeartbeatMsAgo: number | null }>;
  redisOk?: () => Promise<boolean>;
  now?: () => number;
}

export async function getOutboxFailedCount(): Promise<number> {
  try {
    return await prisma.outboxEvent.count({
      where: { processedAt: null, retryCount: { gte: 3 } },
    });
  } catch (e) {
    logger.warn({ type: 'alerts_outbox_error', message: e instanceof Error ? e.message : 'unknown' });
    return 0;
  }
}

export async function quickDbOk(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

export async function quickWorkerAlive(nowMs: number): Promise<{ alive: boolean; lastHeartbeatMsAgo: number | null }> {
  let hbRaw: unknown = null;
  try {
    hbRaw = await getWorkerHeartbeat();
  } catch {
    hbRaw = null;
  }
  const hb: number | null = typeof hbRaw === 'number' ? hbRaw : null;
  return { alive: !!hb && nowMs - (hb ?? nowMs + 99999) < 20000, lastHeartbeatMsAgo: hb ? nowMs - hb : null };
}

export async function buildAlerts(deps?: AlertDeps) {
  const failedCount = await (deps?.outboxFailedCount ? deps.outboxFailedCount() : getOutboxFailedCount());
  const dbOk = await (deps?.dbOk ? deps.dbOk() : quickDbOk());
  let redisOk = true;
  if (process.env.NODE_ENV !== 'test') {
    try {
      const v = await (deps?.redisOk ? deps.redisOk() : redisPing());
      redisOk = Boolean(v);
    } catch {
      redisOk = false;
    }
  }
  const nowFn = deps?.now || Date.now;
  const now = typeof nowFn === 'function' ? nowFn() : Date.now();
  const worker = await (deps?.workerAlive ? deps.workerAlive(now) : quickWorkerAlive(now));
  const workerAlive = worker.alive;

  const reasons: string[] = [];
  if (!dbOk) reasons.push('database_error');
  if (!redisOk) reasons.push('redis_error');
  if (!workerAlive) reasons.push('worker_down');
  if (failedCount > 0) reasons.push('outbox_failures');

  const status: 'ok' | 'degraded' | 'error' =
    reasons.length === 0 ? 'ok' : (!dbOk || !redisOk) ? 'error' : 'degraded';

  const data = {
    status,
    reasons,
    indicators: {
      outboxFailed: failedCount,
      workerAlive,
      redisOk,
      dbOk,
      lastHeartbeatMsAgo: worker.lastHeartbeatMsAgo,
    },
    timestamp: new Date().toISOString(),
  };
  if (status !== 'ok') {
    logger.warn({ type: 'system_alert_status', status, reasons, indicators: data.indicators });
  }
  return data;
}

