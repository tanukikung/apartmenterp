/**
 * Phase C: Production Alerting System
 *
 * Sends real alerts to Slack and/or PagerDuty.
 * Deduplicates alerts, rate-limits, and enriches with correlation context.
 */

import { logger } from '@/lib/utils/logger';

// ─── Alert Types ───────────────────────────────────────────────────────────────

export type AlertSeverity = 'CRITICAL' | 'WARNING' | 'INFO';

export interface Alert {
  severity: AlertSeverity;
  service: string;
  message: string;
  /** Unique fingerprint for deduplication */
  fingerprint: string;
  /** Extra key-value pairs for correlation */
  metadata?: Record<string, string | number | boolean>;
  /** Unix timestamp (auto-filled) */
  timestamp?: number;
}

// ─── Slack Integration ──────────────────────────────────────────────────────────

interface SlackBlock {
  type: string;
  text?: { type: string; text: string; emoji?: boolean };
  fields?: { type: string; text: string }[];
  elements?: { type: string; text: string }[];
}

function buildSlackPayload(alert: Alert, slackChannel?: string): Record<string, unknown> {
  const severityEmoji = alert.severity === 'CRITICAL' ? '🔴' : alert.severity === 'WARNING' ? '🟡' : '🟢';
  const color = alert.severity === 'CRITICAL' ? '#FF0000' : alert.severity === 'WARNING' ? '#FFA500' : '#00AA00';

  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `${severityEmoji} [${alert.severity}] ${alert.service}`, emoji: true },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: alert.message },
    },
  ];

  if (alert.metadata) {
    const fieldLines = Object.entries(alert.metadata).map(
      ([k, v]) => `*${k}*: \`${String(v)}\``
    );
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: fieldLines.join('\n') },
    });
  }

  const ts = alert.timestamp ? new Date(alert.timestamp * 1000).toISOString() : new Date().toISOString();
  blocks.push({
    type: 'context',
    elements: [
      { type: 'mrkdwn', text: `⏰ ${ts}  •  🔖 \`${alert.fingerprint}\`` },
    ],
  });

  return {
    channel: slackChannel ?? '#alerts',
    username: 'Apartment ERP AlertBot',
    icon_emoji: alert.severity === 'CRITICAL' ? ':rotating_light:' : ':warning:',
    attachments: [
      {
        color,
        blocks,
        fallback: `[${alert.severity}] ${alert.service}: ${alert.message}`,
      },
    ],
  };
}

async function sendSlackAlert(webhookUrl: string, payload: Record<string, unknown>): Promise<void> {
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`Slack webhook returned ${res.status}: ${await res.text()}`);
  }
}

// ─── PagerDuty Integration ─────────────────────────────────────────────────────

interface PagerDutyPayload {
  routing_key: string;
  event_action: string;
  dedup_key?: string;
  payload: {
    summary: string;
    severity: 'critical' | 'error' | 'warning' | 'info';
    source: string;
    timestamp?: string;
    component?: string;
    group?: string;
    class?: string;
    custom_details?: Record<string, string | number | boolean>;
  };
}

function buildPagerDutyPayload(alert: Alert, routingKey: string): PagerDutyPayload {
  const severityMap: Record<string, PagerDutyPayload['payload']['severity']> = {
    CRITICAL: 'critical',
    WARNING: 'warning',
    INFO: 'info',
  };

  return {
    routing_key: routingKey,
    event_action: 'trigger',
    dedup_key: alert.fingerprint,
    payload: {
      summary: `[${alert.severity}] ${alert.service}: ${alert.message}`,
      severity: severityMap[alert.severity] ?? 'warning',
      source: alert.metadata?.host as string ?? alert.service,
      timestamp: alert.timestamp ? new Date(alert.timestamp * 1000).toISOString() : new Date().toISOString(),
      component: alert.service,
      group: 'apartment-erp',
      class: 'alert',
      custom_details: (alert.metadata ?? {}) as Record<string, string | number | boolean>,
    },
  };
}

async function sendPagerDutyAlert(eventUrl: string, payload: PagerDutyPayload): Promise<void> {
  const res = await fetch(eventUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`PagerDuty Events API returned ${res.status}: ${await res.text()}`);
  }
}

// ─── Alert Deduplication ───────────────────────────────────────────────────────

/**
 * In-memory dedup cache. Key = fingerprint, Value = last sent timestamp.
 * Entry expires after DEDUP_WINDOW_MS milliseconds.
 */
const dedupCache = new Map<string, number>();
const DEDUP_WINDOW_MS = 5 * 60 * 1000; // 5 minutes same alert = skip

function isDuplicate(fingerprint: string): boolean {
  const lastSent = dedupCache.get(fingerprint);
  if (lastSent && Date.now() - lastSent < DEDUP_WINDOW_MS) {
    return true;
  }
  dedupCache.set(fingerprint, Date.now());
  // Prune old entries periodically
  if (dedupCache.size > 10_000) {
    const cutoff = Date.now() - DEDUP_WINDOW_MS;
    for (const [k, v] of dedupCache) {
      if (v < cutoff) dedupCache.delete(k);
    }
  }
  return false;
}

// ─── Rate Limiter ──────────────────────────────────────────────────────────────

let alertRateLimitUntil = 0;
const ALERT_RATE_LIMIT_MS = 10_000; // max 1 alert burst per 10s (per-process)

function isRateLimited(): boolean {
  if (Date.now() < alertRateLimitUntil) return true;
  alertRateLimitUntil = Date.now() + ALERT_RATE_LIMIT_MS;
  return false;
}

// ─── Main Alert Dispatcher ─────────────────────────────────────────────────────

export interface AlertConfig {
  slackWebhookUrl?: string;
  slackChannel?: string;
  pagerDutyRoutingKey?: string;
  pagerDutyEventUrl?: string;
  /** Min interval between alerts of same fingerprint (ms). Default 5 min. */
  dedupWindowMs?: number;
}

export async function sendAlert(alert: Alert, config: AlertConfig): Promise<void> {
  alert.timestamp = Math.floor(Date.now() / 1000);

  // Deduplicate
  if (isDuplicate(alert.fingerprint)) {
    logger.debug({ type: 'alert_deduped', fingerprint: alert.fingerprint });
    return;
  }

  // Rate limit
  if (isRateLimited()) {
    logger.warn({ type: 'alert_rate_limited', fingerprint: alert.fingerprint });
    return;
  }

  const errors: string[] = [];

  if (config.slackWebhookUrl) {
    try {
      const payload = buildSlackPayload(alert, config.slackChannel);
      await sendSlackAlert(config.slackWebhookUrl, payload);
      logger.info({ type: 'alert_sent_slack', severity: alert.severity, service: alert.service });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`Slack: ${msg}`);
      logger.error({ type: 'alert_slack_failed', error: msg });
    }
  }

  if (config.pagerDutyRoutingKey && config.pagerDutyEventUrl) {
    try {
      const payload = buildPagerDutyPayload(alert, config.pagerDutyRoutingKey);
      await sendPagerDutyAlert(config.pagerDutyEventUrl, payload);
      logger.info({ type: 'alert_sent_pagerduty', severity: alert.severity, service: alert.service });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`PagerDuty: ${msg}`);
      logger.error({ type: 'alert_pagerduty_failed', error: msg });
    }
  }

  if (errors.length > 0) {
    // Even if alerting failed, log the alert locally for forensics
    logger.error({
      type: 'alert_failed_delivery',
      fingerprint: alert.fingerprint,
      severity: alert.severity,
      service: alert.service,
      message: alert.message,
      metadata: alert.metadata,
      deliveryErrors: errors,
    });
  }
}

// ─── Convenience Alert Constructors ───────────────────────────────────────────

export function makeAlert(
  severity: AlertSeverity,
  service: string,
  message: string,
  fingerprint: string,
  metadata?: Record<string, string | number | boolean>
): Alert {
  return { severity, service, message, fingerprint, metadata, timestamp: Math.floor(Date.now() / 1000) };
}

export const alert = {
  dbPoolExhausted(service: string, metadata?: Record<string, string | number | boolean>) {
    return makeAlert('CRITICAL', service, 'Database connection pool exhausted', 'db-pool-exhausted', metadata);
  },
  redisDown(service: string, host?: string) {
    return makeAlert('CRITICAL', service, 'Redis is DOWN — circuit breaker OPEN', 'redis-down', { host: host ?? 'unknown' });
  },
  paymentFailureRate(service: string, rate: number, threshold: number) {
    return makeAlert('CRITICAL', service, `Payment failure rate ${rate.toFixed(2)}% exceeds threshold ${threshold}%`, 'payment-failure-rate', { rate, threshold });
  },
  outboxDeadLetter(service: string, count: number) {
    return makeAlert('CRITICAL', service, `Outbox dead-letter spike: ${count} messages`, 'outbox-dead-letter', { count });
  },
  lineCircuitOpen(service: string) {
    return makeAlert('WARNING', service, 'LINE API circuit breaker is OPEN', 'line-circuit-open', {});
  },
  latencyThreshold(service: string, endpoint: string, p95Ms: number, thresholdMs: number) {
    return makeAlert('WARNING', service, `p95 latency ${p95Ms}ms exceeds threshold ${thresholdMs}ms`, 'latency-threshold', { endpoint, p95Ms, thresholdMs });
  },
  reconciliationIssues(service: string, count: number, severity: string) {
    return makeAlert('WARNING', service, `Reconciliation found ${count} issues (severity: ${severity})`, 'reconciliation-issues', { count, severity });
  },
};
