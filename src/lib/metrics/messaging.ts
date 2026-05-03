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
  inbox_received_total:    number;
  inbox_processed_total:   number;
  inbox_failed_total:      number;
  inbox_dead_total:        number;
  outbox_sent_total:       number;
  outbox_failed_total:     number;
  outbox_rate_limited_total: number;
  outbox_permanent_fail_total: number;
}

const counters: Counters = {
  inbox_received_total:       0,
  inbox_processed_total:      0,
  inbox_failed_total:         0,
  inbox_dead_total:           0,
  outbox_sent_total:          0,
  outbox_failed_total:        0,
  outbox_rate_limited_total:  0,
  outbox_permanent_fail_total: 0,
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
}

const startedAt = Date.now();

export function getSnapshot(): MetricsSnapshot {
  return {
    counters:   { ...counters },
    latency: {
      inbox:  histogramSnapshot(inboxLatencies),
      outbox: histogramSnapshot(outboxLatencies),
    },
    uptimeSecs: Math.floor((Date.now() - startedAt) / 1000),
  };
}
