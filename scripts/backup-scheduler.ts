import cron from 'node-cron';
import { runBackup } from './backup-db';
import { logger } from '@/lib/utils/logger';

// Lazy import to avoid circular dependency
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _recordAlert: any = null;
function recordAlert(severity: string, source: string, message: string, meta?: Record<string, unknown>) {
  if (!_recordAlert) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      _recordAlert = require('@/lib/metrics/alerts').recordAlert;
    } catch {
      return; // Module not available (e.g., in edge runtime)
    }
  }
  _recordAlert(severity, source, message, meta);
}

// ── Backup status tracker ────────────────────────────────────────────────────────

export interface BackupStatus {
  lastAttempt: string | null;
  lastSuccess: string | null;
  lastError: string | null;
  consecutiveFailures: number;
}

let backupStatus: BackupStatus = {
  lastAttempt: null,
  lastSuccess: null,
  lastError: null,
  consecutiveFailures: 0,
};

export function getBackupStatus(): BackupStatus {
  return { ...backupStatus };
}

export function recordBackupStart(): void {
  backupStatus.lastAttempt = new Date().toISOString();
}

export function recordBackupSuccess(): void {
  backupStatus.lastSuccess = new Date().toISOString();
  backupStatus.lastError = null;
  backupStatus.consecutiveFailures = 0;
}

export function recordBackupFailure(errorMessage: string): void {
  backupStatus.lastError = errorMessage;
  backupStatus.consecutiveFailures++;
  if (backupStatus.consecutiveFailures >= 2) {
    recordAlert(
      'critical',
      'backup',
      `Backup has failed ${backupStatus.consecutiveFailures} consecutive times: ${errorMessage}`
    );
  } else {
    recordAlert(
      'warning',
      'backup',
      `Backup failed: ${errorMessage}`
    );
  }
}

export type ScheduleFn = (expression: string, handler: () => void) => { stop: () => void };

export function startBackupScheduler(
  expression: string = process.env.BACKUP_CRON || '0 3 * * *',
  scheduleFn: ScheduleFn = (expr, handler) => {
    const task = cron.schedule(expr, handler);
    return { stop: () => task.stop() };
  },
  run: () => Promise<void> = async () => { await runBackup(); }
): { stop: () => void } {
  logger.info({ type: 'backup_scheduler_start', expression });
  const task = scheduleFn(expression, async () => {
    const start = Date.now();
    logger.info({ type: 'backup_job_trigger' });
    recordBackupStart();
    try {
      await run();
      const durationMs = Date.now() - start;
      recordBackupSuccess();
      logger.info({ type: 'backup_job_complete', durationMs });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      recordBackupFailure(message);
      logger.error({
        type: 'backup_job_failed',
        message,
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
