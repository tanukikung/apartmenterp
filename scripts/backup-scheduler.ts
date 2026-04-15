import cron from 'node-cron';
import { runBackup } from './backup-db';
import { logger } from '@/lib/utils/logger';

export type ScheduleFn = (expression: string, handler: () => void) => { stop: () => void };

export function startBackupScheduler(
  expression: string = process.env.BACKUP_CRON || '0 3 * * *',
  scheduleFn: ScheduleFn = (expr, handler) => {
    const task = cron.schedule(expr, handler);
    return { stop: () => task.stop() };
  },
  run: () => Promise<unknown> = runBackup
): { stop: () => void } {
  logger.info({ type: 'backup_scheduler_start', expression });
  const task = scheduleFn(expression, async () => {
    const start = Date.now();
    logger.info({ type: 'backup_job_trigger' });
    try {
      await run();
      logger.info({ type: 'backup_job_complete', durationMs: Date.now() - start });
    } catch (e) {
      logger.error({
        type: 'backup_job_failed',
        message: e instanceof Error ? e.message : String(e),
      });
    }
  });
  return task;
}

if (require.main === module) {
  startBackupScheduler();
  // Keep process alive
  logger.info({ type: 'backup_scheduler_started_cli' });
}
