import { NextRequest, NextResponse } from 'next/server';
import {
  getSnapshot,
  formatPrometheusText,
  collectDbMetrics,
  collectOutboxMetrics,
  collectJobMetrics,
} from '@/lib/metrics/registry';

/**
 * GET /api/metrics
 *
 * Prometheus-compatible metrics endpoint.
 * No authentication — intended for scraping by Prometheus server
 * on the same private network.
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
