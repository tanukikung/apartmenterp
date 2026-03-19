import { startOutboxWorker } from '@/infrastructure/outbox/outbox.processor';
import { setWorkerHeartbeat, getRedisClient } from '@/infrastructure/redis';
import { runStartupChecks } from '@/lib/config/startup-check';

async function bootstrapWorker(): Promise<void> {
  runStartupChecks();
  if (process.env.NODE_ENV === 'test') return;
  const { bootstrapMessagingRuntime } = await import('@/modules/messaging/bootstrap');
  await bootstrapMessagingRuntime();
  startOutboxWorker();
  setInterval(() => {
    void setWorkerHeartbeat(30);
  }, 10_000);
}

void bootstrapWorker().catch(() => undefined);

async function shutdown() {
  console.log('Worker shutting down');
  try {
    const client = getRedisClient();
    if (client) {
      await client.quit().catch(() => undefined);
    }
  } finally {
    process.exit(0);
  }
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
