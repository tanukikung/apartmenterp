import { getOutboxProcessor } from '@/lib/outbox';
import { logger } from '@/lib/utils/logger';

export function startOutboxWorker(): void {
  const processor = getOutboxProcessor(undefined, {
    batchSize: 100,
    maxRetries: 3,
    pollInterval: 5000,
    enabled: true,
  });
  processor.start();
  logger.info({ type: 'outbox_worker_started' });
}

