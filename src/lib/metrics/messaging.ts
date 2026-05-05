/**
 * In-process messaging metrics
 *
 * Lightweight counters and a latency histogram (sliding window, last 1 000 samples).
 * These are process-local and reset on restart — they are operational signals for
 * dashboards and alerts, NOT financial audit data (which lives in the DB audit_logs).
 *
 * In a multi-instance deployment the health endpoint queries DB aggregates directly,
 * so per-instance counters are only additive signals. For exact cross-instance counts
 * always use the DB queries in the health endpoint.
 */

// ── Counters ──────────────────────────────────────────────────────────────────

interface Counters {
  inbox_received_total:                number;
  inbox_processed_total:              number;
  inbox_failed_total:                  number;
  inbox_dead_total:                    number;
  outbox_sent_total:                   number;
  outbox_failed_total:                number;
  outbox_rate_limited_total:          number;
  outbox_permanent_fail_total:        number;
  outbox_duplicates_skipped_total:    number;
  outbox_dead_letter_total:           number;
  outbox_cancelled_total:            number; // events skipped because source was cancelled
  eventbus_dedup_skipped_total:        number;
  line_circuit_open_total:            number;
  line_circuit_reject_total:          number;
  rate_limit_block_total:              number;
  db_pool_exhausted_total:            number;
  redis_down_total:                    number;
  distributed_circuit_open_total:     number;
  distributed_circuit_reject_total:   number;
  distributed_circuit_recovery_total: number;
  idempotency_conflict_total:         number;
  system_readonly_activations_total:  number;
  db_unguarded_query_total:            number;
  // Phase 5: critical business path metrics
  payment_success_total:               number;
  payment_failure_total:               number;
  invoice_generated_total:             number;
  invoice_sent_total:                  number;
  auth_login_success_total:            number;
  auth_login_failure_total:            number;
}

const counters: Counters = {
  inbox_received_total:                 0,
  inbox_processed_total:                0,
  inbox_failed_total:                   0,
  inbox_dead_total:                     0,
  outbox_sent_total:                    0,
  outbox_failed_total:                  0,
  outbox_rate_limited_total:            0,
  outbox_permanent_fail_total:          0,
  outbox_duplicates_skipped_total:      0,
  outbox_dead_letter_total:             0,
  outbox_cancelled_total:              0,
  eventbus_dedup_skipped_total:         0,
  line_circuit_open_total:              0,
  line_circuit_reject_total:            0,
  rate_limit_block_total:               0,
  db_pool_exhausted_total:              0,
  redis_down_total:                     0,
  distributed_circuit_open_total:       0,
  distributed_circuit_reject_total:      0,
  distributed_circuit_recovery_total:   0,
  idempotency_conflict_total:           0,
  system_readonly_activations_total:    0,
  db_unguarded_query_total:              0,
  // Phase 5: critical business path metrics
  payment_success_total:                 0,
  payment_failure_total:                 0,
  invoice_generated_total:               0,
  invoice_sent_total:                    0,
  auth_login_success_total:              0,
  auth_login_failure_total:              0,
};

export function inc(key: keyof Counters, by = 1): void {
  counters[key] += by;
}

// ── Latency histogram (sliding window) ───────────────────────────────────────

const MAX_SAMPLES = 1_000;
const inboxLatencies:  number[] = [];
const outboxLatencies: number[] = [];

function recordLatency(buf: number[], ms: number): void {
  buf.push(ms);
  if (buf.length > MAX_SAMPLES) buf.shift();
}

export function recordInboxLatency(ms: number):  void { recordLatency(inboxLatencies,  ms); }
export function recordOutboxLatency(ms: number): void { recordLatency(outboxLatencies, ms); }

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.floor(sorted.length * p);
  return sorted[Math.min(idx, sorted.length - 1)];
}

function histogramSnapshot(raw: number[]): {
  count: number; p50: number | null; p95: number | null; p99: number | null; max: number | null;
} {
  if (raw.length === 0) return { count: 0, p50: null, p95: null, p99: null, max: null };
  const sorted = [...raw].sort((a, b) => a - b);
  return {
    count: sorted.length,
    p50:   percentile(sorted, 0.5),
    p95:   percentile(sorted, 0.95),
    p99:   percentile(sorted, 0.99),
    max:   sorted[sorted.length - 1],
  };
}

// ── Snapshot ──────────────────────────────────────────────────────────────────

export interface MetricsSnapshot {
  counters:  Counters;
  latency: {
    inbox:  ReturnType<typeof histogramSnapshot>;
    outbox: ReturnType<typeof histogramSnapshot>;
  };
  uptimeSecs: number;
  // Outbox processor gauge-like fields (reset each snapshot)
  outboxQueueDepth:      number;
  outboxProcessingLagMs: number;
  currentBatchSize:      number;
}

const startedAt = Date.now();

export function getSnapshot(overrides?: {
  outboxQueueDepth?:      number;
  outboxProcessingLagMs?: number;
  currentBatchSize?:     number;
}): MetricsSnapshot {
  return {
    counters:   { ...counters },
    latency: {
      inbox:  histogramSnapshot(inboxLatencies),
      outbox: histogramSnapshot(outboxLatencies),
    },
    uptimeSecs: Math.floor((Date.now() - startedAt) / 1000),
    outboxQueueDepth:      overrides?.outboxQueueDepth      ?? 0,
    outboxProcessingLagMs: overrides?.outboxProcessingLagMs ?? 0,
    currentBatchSize:     overrides?.currentBatchSize     ?? 0,
  };
}

// ── Test helper ────────────────────────────────────────────────────────────────

export function getCounterValue(key: keyof Counters): number {
  return counters[key];
}
