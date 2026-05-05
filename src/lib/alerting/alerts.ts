/**
 * Phase C: Alerting Integration — wires sendAlert into production code paths.
 *
 * Call sites:
 *  - Outbox dead-letter (src/lib/outbox/processor.ts → alert.outboxDeadLetter)
 *  - Reconciliation CRITICAL issues (src/modules/reconciliation/reconciliation.service.ts → alert.reconciliationIssues)
 *  - Redis circuit breaker state transitions (src/infrastructure/redis/index.ts → alert.redisDown, alert.lineCircuitOpen)
 *  - DB pool exhaustion (src/lib/db/client.ts → alert.dbPoolExhausted)
 *  - Cron/long-job latency (src/server/cron.ts → alert.latencyThreshold)
 */

import { sendAlert, alert, type AlertConfig } from './index';
import { type CircuitState } from '@/infrastructure/redis';

// Lazy-load config from env (avoids importing entire config system at module init)
function getAlertConfig(): AlertConfig {
  return {
    slackWebhookUrl: process.env.SLACK_ALERT_WEBHOOK_URL,
    slackChannel: process.env.SLACK_ALERT_CHANNEL,
    pagerDutyRoutingKey: process.env.PAGERDUTY_ROUTING_KEY,
    pagerDutyEventUrl: process.env.PAGERDUTY_EVENT_URL,
  };
}

// ── Outbox Dead-Letter Alert ─────────────────────────────────────────────────

export async function alertOutboxDeadLetter(eventId: string, aggregateType: string, aggregateId: string, retryCount: number, errorCode: string): Promise<void> {
  if (!process.env.SLACK_ALERT_WEBHOOK_URL && !process.env.PAGERDUTY_ROUTING_KEY) return;
  const a = alert.outboxDeadLetter('apartment-erp', 1);
  a.metadata = { eventId, aggregateType, aggregateId, retryCount, errorCode };
  await sendAlert(a, getAlertConfig());
}

// ── Reconciliation Alert ─────────────────────────────────────────────────────

export async function alertReconciliationIssues(issues: Array<{ type: string; severity: string; entityId: string }>): Promise<void> {
  if (!process.env.SLACK_ALERT_WEBHOOK_URL && !process.env.PAGERDUTY_ROUTING_KEY) return;
  const criticalCount = issues.filter(i => i.severity === 'CRITICAL').length;
  if (criticalCount === 0) return;
  const a = alert.reconciliationIssues('apartment-erp', criticalCount, 'CRITICAL');
  a.metadata = { types: [...new Set(issues.map(i => i.type))].join(','), firstEntityId: issues[0]?.entityId };
  await sendAlert(a, getAlertConfig());
}

// ── Redis/Circuit Breaker Alert ─────────────────────────────────────────────

export async function alertRedisDown(host: string, consecutiveFailures: number): Promise<void> {
  if (!process.env.SLACK_ALERT_WEBHOOK_URL && !process.env.PAGERDUTY_ROUTING_KEY) return;
  const a = alert.redisDown('apartment-erp', host);
  a.metadata = { consecutiveFailures };
  await sendAlert(a, getAlertConfig());
}

export async function alertLineCircuitOpen(): Promise<void> {
  if (!process.env.SLACK_ALERT_WEBHOOK_URL && !process.env.PAGERDUTY_ROUTING_KEY) return;
  const a = alert.lineCircuitOpen('apartment-erp');
  await sendAlert(a, getAlertConfig());
}

export async function alertCircuitStateTransition(service: string, from: CircuitState, to: CircuitState): Promise<void> {
  if (!process.env.SLACK_ALERT_WEBHOOK_URL && !process.env.PAGERDUTY_ROUTING_KEY) return;
  // Only alert on OPEN and HALF_OPEN (recovery is INFO)
  if (to === 'CLOSED') return;
  if (to === 'OPEN') {
    const a = alert.redisDown(service, undefined);
    a.fingerprint = `circuit-open-${service}`;
    a.metadata = { from, to, service };
    await sendAlert(a, getAlertConfig());
  } else if (to === 'HALF_OPEN') {
    const a = alert.lineCircuitOpen(service);
    a.fingerprint = `circuit-half-open-${service}`;
    a.metadata = { from, to, service };
    await sendAlert(a, getAlertConfig());
  }
}

// ── DB Pool Exhaustion Alert ─────────────────────────────────────────────────

export async function alertDbPoolExhausted(endpoint: string, pendingCount: number): Promise<void> {
  if (!process.env.SLACK_ALERT_WEBHOOK_URL && !process.env.PAGERDUTY_ROUTING_KEY) return;
  const a = alert.dbPoolExhausted('apartment-erp', { endpoint, pendingRequests: pendingCount });
  await sendAlert(a, getAlertConfig());
}

// ── Latency Alert ─────────────────────────────────────────────────────────────

export async function alertLatencyThreshold(endpoint: string, p95Ms: number, thresholdMs: number): Promise<void> {
  if (!process.env.SLACK_ALERT_WEBHOOK_URL && !process.env.PAGERDUTY_ROUTING_KEY) return;
  const a = alert.latencyThreshold('apartment-erp', endpoint, p95Ms, thresholdMs);
  await sendAlert(a, getAlertConfig());
}

// ── Payment Failure Rate Alert ───────────────────────────────────────────────

export async function alertPaymentFailureRate(rate: number, threshold: number): Promise<void> {
  if (!process.env.SLACK_ALERT_WEBHOOK_URL && !process.env.PAGERDUTY_ROUTING_KEY) return;
  const a = alert.paymentFailureRate('apartment-erp', rate, threshold);
  await sendAlert(a, getAlertConfig());
}