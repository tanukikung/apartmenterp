import { getInboxProcessor } from '@/lib/inbox/processor';
import { logger } from '@/lib/utils/logger';

export function startInboxWorker(): void {
  const processor = getInboxProcessor({
    batchSize: 50,
    maxRetries: 5,
    pollIntervalMs: 2000,
    enabled: true,
  });
  processor.start();
  logger.info({ type: 'inbox_worker_started' });
}
