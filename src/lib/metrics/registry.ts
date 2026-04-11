/**
 * In-memory Prometheus metrics registry.
 *
 * Single-instance module — all counters/histograms are process-global.
 * Suitable for single-process Next.js deployments.
 * For multi-instance (e.g., Vercel) use a Redis-backed store instead.
 */

import { getAllJobEntries } from '@/modules/jobs/job-store';

// ── Metric types ───────────────────────────────────────────────────────────────

export type MetricType = 'counter' | 'gauge' | 'histogram';

interface MetricDef {
  type: MetricType;
  help: string;
}

// ── Registry internals ────────────────────────────────────────────────────────

const metricDefs = new Map<string, MetricDef>();
const counters = new Map<string, Map<string, number>>();
const gauges = new Map<string, Map<string, number>>();
const histograms = new Map<string, Map<string, { buckets: Array<{ le: number; count: number }>; sum: number; count: number }>>();

// Default histogram buckets (in seconds, matching Prometheus client default)
const DEFAULT_HISTOGRAM_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

// Normalize label map to a deterministic key string
function labelKey(labels: Record<string, string>): string {
  return Object.keys(labels)
    .sort()
    .map((k) => `${k}=${labels[k]}`)
    .join(',');
}

function registerMetric(name: string, type: MetricType, help: string): void {
  if (!metricDefs.has(name)) {
    metricDefs.set(name, { type, help });
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Increment a counter metric.
 */
export function incrementCounter(
  name: string,
  labels: Record<string, string> = {}
): void {
  registerMetric(name, 'counter', '');
  const key = labelKey(labels);
  const nameMap = counters.get(name);
  if (nameMap) {
    nameMap.set(key, (nameMap.get(key) ?? 0) + 1);
  } else {
    counters.set(name, new Map([[key, 1]]));
  }
}

/**
 * Set a gauge metric to an absolute value.
 */
export function setGauge(
  name: string,
  value: number,
  labels: Record<string, string> = {}
): void {
  registerMetric(name, 'gauge', '');
  const key = labelKey(labels);
  const nameMap = gauges.get(name);
  if (nameMap) {
    nameMap.set(key, value);
  } else {
    gauges.set(name, new Map([[key, value]]));
  }
}

/**
 * Observe a value in a histogram metric.
 */
export function observeHistogram(
  name: string,
  value: number,
  labels: Record<string, string> = {}
): void {
  registerMetric(name, 'histogram', '');
  const key = labelKey(labels);
  const buckets = DEFAULT_HISTOGRAM_BUCKETS;

  if (!histograms.has(name)) {
    const newMap = new Map<string, { buckets: Array<{ le: number; count: number }>; sum: number; count: number }>();
    newMap.set(key, {
      buckets: buckets.map((le) => ({ le, count: 0 })),
      sum: value,
      count: 1,
    });
    histograms.set(name, newMap);
    return;
  }

  const nameMap = histograms.get(name)!;
  if (!nameMap.has(key)) {
    nameMap.set(key, {
      buckets: buckets.map((le) => ({ le, count: 0 })),
      sum: value,
      count: 1,
    });
    return;
  }

  const entry = nameMap.get(key)!;
  for (const bucket of entry.buckets) {
    if (value <= bucket.le) bucket.count++;
  }
  entry.sum += value;
  entry.count++;
}

/**
 * Record an HTTP request in metrics.
 * Calls incrementCounter and observeHistogram internally.
 */
export function recordHttpRequest(
  method: string,
  route: string,
  status: number,
  durationSeconds: number
): void {
  const labels = { method, route, status: String(status) };
  incrementCounter('http_requests_total', labels);
  observeHistogram('http_request_duration_seconds', durationSeconds, { method, route });
}

// ── Snapshot ──────────────────────────────────────────────────────────────────

export interface MetricsSnapshot {
  counters: Array<{ name: string; help: string; labels: Record<string, string>; value: number }>;
  gauges: Array<{ name: string; help: string; labels: Record<string, string>; value: number }>;
  histograms: Array<{
    name: string;
    help: string;
    labels: Record<string, string>;
    count: number;
    sum: number;
    buckets: Array<{ le: number; count: number }>;
  }>;
}

export function getSnapshot(): MetricsSnapshot {
  const counterEntries: MetricsSnapshot['counters'] = [];
  for (const [name, labelMap] of counters.entries()) {
    const def = metricDefs.get(name);
    for (const [labelKeyStr, value] of labelMap.entries()) {
      const labels = parseLabelKey(labelKeyStr);
      counterEntries.push({ name, help: def?.help ?? '', labels, value });
    }
  }

  const gaugeEntries: MetricsSnapshot['gauges'] = [];
  for (const [name, labelMap] of gauges.entries()) {
    const def = metricDefs.get(name);
    for (const [labelKeyStr, value] of labelMap.entries()) {
      const labels = parseLabelKey(labelKeyStr);
      gaugeEntries.push({ name, help: def?.help ?? '', labels, value });
    }
  }

  const histogramEntries: MetricsSnapshot['histograms'] = [];
  for (const [name, labelMap] of histograms.entries()) {
    const def = metricDefs.get(name);
    for (const [labelKeyStr, entry] of labelMap.entries()) {
      const labels = parseLabelKey(labelKeyStr);
      histogramEntries.push({
        name,
        help: def?.help ?? '',
        labels,
        count: entry.count,
        sum: entry.sum,
        buckets: [...entry.buckets],
      });
    }
  }

  return { counters: counterEntries, gauges: gaugeEntries, histograms: histogramEntries };
}

function parseLabelKey(key: string): Record<string, string> {
  const labels: Record<string, string> = {};
  if (!key) return labels;
  for (const pair of key.split(',')) {
    if (!pair) continue;
    const eqIdx = pair.indexOf('=');
    if (eqIdx < 0) continue;
    labels[pair.slice(0, eqIdx)] = pair.slice(eqIdx + 1);
  }
  return labels;
}

// ── Format for Prometheus ─────────────────────────────────────────────────────

function formatValue(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(6);
}

function formatLabelStr(labels: Record<string, string>): string {
  const entries = Object.entries(labels);
  if (entries.length === 0) return '';
  return '{' + entries.map(([k, v]) => `${k}="${v}"`).join(',') + '}';
}

export function formatPrometheusText(snapshot: MetricsSnapshot): string {
  const lines: string[] = [];

  // Gauges
  for (const { name, help, labels, value } of snapshot.gauges) {
    const labelStr = formatLabelStr(labels);
    lines.push(`# TYPE ${name} gauge`);
    lines.push(`# HELP ${name} ${help}`);
    lines.push(`${name}${labelStr} ${formatValue(value)}`);
  }

  // Counters
  for (const { name, help, labels, value } of snapshot.counters) {
    const labelStr = formatLabelStr(labels);
    lines.push(`# TYPE ${name} counter`);
    lines.push(`# HELP ${name} ${help}`);
    lines.push(`${name}${labelStr} ${formatValue(value)}`);
  }

  // Histograms
  for (const { name, help, labels, count, sum, buckets } of snapshot.histograms) {
    const labelStr = formatLabelStr(labels);
    lines.push(`# TYPE ${name} histogram`);
    lines.push(`# HELP ${name} ${help}`);
    for (const bucket of buckets) {
      const bucketLabel = labelStr === '' ? `{le="${bucket.le}"}` : labelStr.replace('}', `,le="${bucket.le}"}`);
      lines.push(`${name}_bucket${bucketLabel} ${bucket.count}`);
    }
    lines.push(`${name}_sum${labelStr} ${formatValue(sum)}`);
    lines.push(`${name}_count${labelStr} ${count}`);
  }

  return lines.join('\n');
}

// ── Dynamic metric collectors (called at scrape time) ─────────────────────────

/**
 * Collect db_connections_active from Prisma.
 */
export async function collectDbMetrics(): Promise<void> {
  try {
    const { prisma } = await import('@/lib/db/client');
    await prisma.$queryRaw`SELECT 1`;
    setGauge('db_connections_active', 1, { state: 'active' });
  } catch {
    setGauge('db_connections_active', 0, { state: 'active' });
    setGauge('db_connections_active', 1, { state: 'error' });
  }
}

/**
 * Collect outbox_queue_length and outbox_failed_count from the outbox processor.
 */
export async function collectOutboxMetrics(): Promise<void> {
  try {
    const { getOutboxProcessor } = await import('@/lib/outbox');
    const processor = getOutboxProcessor();
    const [pending, failed] = await Promise.all([
      processor.getPendingCount(),
      processor.getFailedCount(),
    ]);
    setGauge('outbox_queue_length', pending);
    setGauge('outbox_failed_count', failed);
  } catch {
    // Silently ignore — metrics endpoint should still return other metrics
  }
}

/**
 * Collect jobs_last_run_timestamp and jobs_last_run_duration_seconds from job store.
 */
export function collectJobMetrics(): void {
  const entries = getAllJobEntries();
  for (const entry of entries) {
    if (entry.lastRun) {
      const ts = new Date(entry.lastRun).getTime() / 1000;
      setGauge('jobs_last_run_timestamp', ts, { job_id: entry.id });
    }
    if (entry.durationMs !== null) {
      const durationSeconds = entry.durationMs / 1000;
      observeHistogram('jobs_last_run_duration_seconds', durationSeconds, { job_id: entry.id });
    }
  }
}
