import { getSnapshot } from '@/lib/metrics/registry';
import { logger } from '@/lib/utils/logger';

const JOB_QUEUE_PENDING_WARN  = Number(process.env.ALERT_JOB_QUEUE_PENDING_WARN  ?? 100);
const JOB_QUEUE_DEAD_ERROR    = Number(process.env.ALERT_JOB_QUEUE_DEAD_ERROR    ?? 10);
const OUTBOX_FAILED_ERROR     = Number(process.env.ALERT_OUTBOX_FAILED_ERROR     ?? 5);
const JOB_FAILURE_WARN        = Number(process.env.ALERT_JOB_FAILURE_WARN        ?? 5);

/**
 * Check alert thresholds against the current metrics snapshot and emit
 * structured log events at the appropriate severity level.
 *
 * Called after each metrics collection interval (every 30 s in instrumentation.ts).
 * No external dependencies — intentionally lightweight so it never blocks.
 */
export function checkAlertThresholds(): void {
  let snapshot;
  try {
    snapshot = getSnapshot();
  } catch {
    return; // metrics registry not yet populated — skip silently
  }

  for (const gauge of snapshot.gauges) {
    if (gauge.name === 'job_queue_pending' && gauge.value > JOB_QUEUE_PENDING_WARN) {
      logger.warn({
        type: 'alert',
        metric: 'job_queue_pending',
        value: gauge.value,
        threshold: JOB_QUEUE_PENDING_WARN,
        message: 'Job queue backlog is high',
      });
    }
    if (gauge.name === 'job_queue_dead' && gauge.value > JOB_QUEUE_DEAD_ERROR) {
      logger.error({
        type: 'alert',
        metric: 'job_queue_dead',
        value: gauge.value,
        threshold: JOB_QUEUE_DEAD_ERROR,
        message: 'Dead job count is high — jobs are failing permanently',
      });
    }
    if (gauge.name === 'outbox_failed_count' && gauge.value > OUTBOX_FAILED_ERROR) {
      logger.error({
        type: 'alert',
        metric: 'outbox_failed_count',
        value: gauge.value,
        threshold: OUTBOX_FAILED_ERROR,
        message: 'Outbox has failed events — downstream delivery broken',
      });
    }
  }

  for (const counter of snapshot.counters) {
    if (counter.name === 'background_jobs_failed_total' && counter.value > JOB_FAILURE_WARN) {
      logger.warn({
        type: 'alert',
        metric: counter.name,
        labels: counter.labels,
        value: counter.value,
        threshold: JOB_FAILURE_WARN,
        message: 'Job failure count elevated',
      });
    }
  }
}
