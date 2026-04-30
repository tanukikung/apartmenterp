import { NextRequest, NextResponse } from 'next/server';
import {
  getSnapshot,
  formatPrometheusText,
  collectDbMetrics,
  collectOutboxMetrics,
  collectJobMetrics,
} from '@/lib/metrics/registry';

export const dynamic = 'force-dynamic';

/**
 * GET /api/metrics
 *
 * Prometheus-compatible metrics endpoint.
 * Intended for scraping by a Prometheus server on the same private network.
 *
 * Authentication:
 *   - If METRICS_TOKEN env var is set, requests must include
 *     `Authorization: Bearer <METRICS_TOKEN>` header (production hardening).
 *   - If unset, the endpoint is open (dev / private-network convention).
 *
 * Exposes:
 *   http_requests_total{method, route, status}
 *   http_request_duration_seconds{method, route}
 *   db_connections_active
 *   outbox_queue_length
 *   outbox_failed_count
 *   jobs_last_run_timestamp{job_id}
 *   jobs_last_run_duration_seconds{job_id}
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const expected = process.env.METRICS_TOKEN;
  if (expected) {
    const header = req.headers.get('authorization') ?? '';
    const supplied = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (supplied !== expected) {
      return new NextResponse('Unauthorized', { status: 401 });
    }
  }

  // Collect fresh values from dynamic sources
  await Promise.all([collectDbMetrics(), collectOutboxMetrics()]);
  collectJobMetrics();

  const snapshot = getSnapshot();
  const text = formatPrometheusText(snapshot);

  return new NextResponse(text, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}
