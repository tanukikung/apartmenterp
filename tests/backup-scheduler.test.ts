import { describe, it, expect } from 'vitest';
import { startBackupScheduler } from '../scripts/backup-scheduler';

describe('backup scheduler', () => {
  it('schedules daily backup with default cron', async () => {
    let capturedExpr: string | undefined;
    let called = false;
    const scheduleFn = (expr: string, handler: () => void) => {
      capturedExpr = expr;
      // simulate immediate run
      handler();
      return { stop: () => void 0 };
    };
    const run = async () => {
      called = true;
    };
    startBackupScheduler(undefined, scheduleFn, run);
    expect(capturedExpr).toBe('0 3 * * *');
    expect(called).toBe(true);
  });

  it('respects BACKUP_CRON override', async () => {
    let capturedExpr: string | undefined;
    const scheduleFn = (expr: string) => {
      capturedExpr = expr;
      return { stop: () => void 0 };
    };
    process.env.BACKUP_CRON = '5 2 * * *';
    startBackupScheduler(undefined, scheduleFn, async () => {});
    expect(capturedExpr).toBe('5 2 * * *');
    delete process.env.BACKUP_CRON;
  });
});
