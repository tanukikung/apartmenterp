/**
 * Audit integrity Prometheus metrics.
 *
 * Exposes:
 *   audit_integrity_check — gauge (1=valid, 0=broken), labelled by check_type
 *   audit_events_checked   — counter, total events verified
 *   audit_check_duration_ms — histogram, check duration in ms
 */

import { setGauge, incrementCounter, observeHistogram } from './registry';

// ---------------------------------------------------------------------------
// Metric names (keep in one place for consistency)
// ---------------------------------------------------------------------------
const METRIC_INTEGRITY = 'audit_integrity_check';
const METRIC_EVENTS_CHECKED = 'audit_events_checked_total';
const METRIC_DURATION_MS = 'audit_check_duration_ms';

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

export type CheckType = 'cron' | 'period_close' | 'health_probe';

export function recordAuditIntegrityResult(
  result: { valid: boolean; eventsChecked: number; durationMs: number },
  checkType: CheckType
): void {
  setGauge(METRIC_INTEGRITY, result.valid ? 1 : 0, { check_type: checkType });
  incrementCounter(METRIC_EVENTS_CHECKED, { check_type: checkType }, result.eventsChecked);
  observeHistogram(METRIC_DURATION_MS, result.durationMs / 1000, { check_type: checkType });
}