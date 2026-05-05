/**
 * STEP 1 INSTRUMENTATION: Bottleneck detection
 * Logs slow queries (>100ms) and per-endpoint timing breakdown
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/utils/logger';

// In-memory slow query tracker (per-process, survives across requests)
const slowQueries: Array<{ duration: number; query: string; source: string; timestamp: number }> = [];
const endpointTimings: Array<{ path: string; method: string; duration: number; status: number; timestamp: number }> = [];

const SLOW_QUERY_THRESHOLD_MS = 100;
const MAX_SLOW_QUERIES = 200;
const MAX_ENDPOINT_TIMINGS = 500;

// Query duration tracking — exported for DB client instrumentation
export function trackSlowQuery(duration: number, query: string, source: 'write' | 'read'): void {
  if (duration < SLOW_QUERY_THRESHOLD_MS) return;
  if (slowQueries.length >= MAX_SLOW_QUERIES) slowQueries.shift();
  slowQueries.push({
    duration,
    query: query.substring(0, 300),
    source,
    timestamp: Date.now(),
  });
}

// Per-endpoint timing middleware
export function withEndpointTiming(
  handler: (req: NextRequest) => Promise<NextResponse>,
  path: string,
  method: string
): (req: NextRequest) => Promise<NextResponse> {
  return async (req: NextRequest) => {
    const start = Date.now();
    try {
      const res = await handler(req);
      const duration = Date.now() - start;
      if (endpointTimings.length >= MAX_ENDPOINT_TIMINGS) endpointTimings.shift();
      endpointTimings.push({
        path,
        method,
        duration,
        status: res.status,
        timestamp: Date.now(),
      });
      // Log if > 200ms
      if (duration > 200) {
        logger.info({
          type: 'slow_endpoint',
          path,
          method,
          duration: `${duration}ms`,
          status: res.status,
        });
      }
      return res;
    } catch (err) {
      const duration = Date.now() - start;
      if (endpointTimings.length >= MAX_ENDPOINT_TIMINGS) endpointTimings.shift();
      endpointTimings.push({
        path,
        method,
        duration,
        status: 500,
        timestamp: Date.now(),
      });
      throw err;
    }
  };
}

// Diagnostic endpoint: GET /api/diag/slow-queries
export async function GET_DIAG_SLOW_QUERIES(): Promise<NextResponse> {
  const now = Date.now();
  const recent = slowQueries.filter(q => now - q.timestamp < 30_000);
  return NextResponse.json({
    success: true,
    data: {
      count: recent.length,
      queries: recent.map(q => ({
        duration: `${q.duration}ms`,
        query: q.query,
        source: q.source,
        age: `${Math.round((now - q.timestamp) / 1000)}s ago`,
      })),
    },
  });
}

// Diagnostic endpoint: GET /api/diag/endpoint-timings
export async function GET_DIAG_ENDPOINT_TIMINGS(): Promise<NextResponse> {
  const now = Date.now();
  const recent = endpointTimings.filter(e => now - e.timestamp < 30_000);

  // Aggregate by path+method
  const buckets = new Map<string, { durations: number[]; count: number; errors: number }>();
  for (const e of recent) {
    const key = `${e.method} ${e.path}`;
    const b = buckets.get(key) ?? { durations: [], count: 0, errors: 0 };
    b.durations.push(e.duration);
    b.count++;
    if (e.status >= 500) b.errors++;
    buckets.set(key, b);
  }

  const summary = Array.from(buckets.entries()).map(([key, b]) => {
    const sorted = b.durations.sort((a, b) => a - b);
    const p50 = sorted[Math.floor(sorted.length * 0.5)] || 0;
    const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
    const p99 = sorted[Math.floor(sorted.length * 0.99)] || 0;
    const avg = b.durations.reduce((a, c) => a + c, 0) / b.durations.length;
    return {
      endpoint: key,
      count: b.count,
      errors: b.errors,
      avgMs: Math.round(avg),
      p50Ms: p50,
      p95Ms: p95,
      p99Ms: p99,
    };
  }).sort((a, b) => b.p95Ms - a.p95Ms);

  return NextResponse.json({
    success: true,
    data: {
      windowSeconds: 30,
      totalRequests: recent.length,
      endpoints: summary.slice(0, 20),
    },
  });
}