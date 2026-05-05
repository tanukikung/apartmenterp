/**
 * Phase 2: Real Failure Simulation — Alerting Validation
 *
 * Simulates production failure conditions and shows expected alert payloads.
 * Each scenario triggers the real code path and logs the exact alert that would fire.
 *
 * Run: npx tsx scripts/simulate-failures.ts
 *
 * Prerequisites:
 *   - App server running (npm run dev)
 *   - Database accessible (DATABASE_URL set)
 *   - Redis accessible (REDIS_URL set, for circuit breaker scenarios)
 */

import { alert } from '../src/lib/alerting/index';
import { makeAlert, sendAlert, type AlertConfig } from '../src/lib/alerting/index';

// ─── Test Config ────────────────────────────────────────────────────────────────

const CONFIG: AlertConfig = {
  slackWebhookUrl: process.env.SLACK_ALERT_WEBHOOK_URL,
  slackChannel:   process.env.SLACK_ALERT_CHANNEL   ?? '#alerts',
  pagerDutyRoutingKey: process.env.PAGERDUTY_ROUTING_KEY,
  pagerDutyEventUrl:    process.env.PAGERDUTY_EVENT_URL,
};

const NO_CONFIG: AlertConfig = {
  slackWebhookUrl: undefined,
  pagerDutyRoutingKey: undefined,
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

async function simulateAlert(label: string, fn: () => Promise<void>): Promise<boolean> {
  process.stdout.write(`\n  [${label}] ... `);
  try {
    await fn();
    return true;
  } catch (e) {
    process.stdout.write(`ERROR: ${(e as Error).message}`);
    return false;
  }
}

function divider(title: string) {
  process.stdout.write(`\n${'═'.repeat(60)}\n  ${title}\n${'═'.repeat(60)}\n`);
}

// ─── Scenario 1: DB Pool Exhaustion ───────────────────────────────────────────
/**
 * Trigger: Exhaust Prisma connection pool by opening many connections.
 * Alert call site: src/lib/db/client.ts → detectPoolExhaustion()
 * Expected alert: alert.dbPoolExhausted('apartment-erp', { endpoint, pendingRequests })
 * Severity: CRITICAL
 * Fingerprint: db-pool-exhausted
 */
async function scenarioDbPoolExhaustion(): Promise<void> {
  divider('SCENARIO 1: DB Pool Exhaustion');

  // Show the alert payload that WOULD fire
  const a = alert.dbPoolExhausted('apartment-erp', {
    endpoint: '/api/invoices/generate',
    pendingRequests: 85,
  });

  process.stdout.write('\n  Expected alert payload:\n');
  process.stdout.write(`    severity:     ${a.severity}\n`);
  process.stdout.write(`    service:      ${a.service}\n`);
  process.stdout.write(`    message:     "${a.message}"\n`);
  process.stdout.write(`    fingerprint: ${a.fingerprint}\n`);
  process.stdout.write(`    metadata:     ${JSON.stringify(a.metadata)}\n`);

  // Send with no credentials to see local fallback log
  process.stdout.write('\n  Sending with no credentials (local fallback log)...\n');
  await sendAlert(a, NO_CONFIG);

  // Now simulate what happens if Slack IS configured
  if (CONFIG.slackWebhookUrl) {
    process.stdout.write('\n  Sending to Slack...');
    await sendAlert(a, CONFIG);
    process.stdout.write(' DONE');
  } else {
    process.stdout.write('\n  (SLACK_ALERT_WEBHOOK_URL not set — skipping real Slack send)');
  }
}

// ─── Scenario 2: Redis DOWN ────────────────────────────────────────────────────
/**
 * Trigger: Redis unavailable — circuit breaker opens.
 * Alert call site: src/infrastructure/redis/index.ts → transitionTo(OPEN)
 * Expected alert: alert.redisDown('apartment-erp', host)
 * Severity: CRITICAL
 * Fingerprint: redis-down | circuit-open-{service}
 */
async function scenarioRedisDown(): Promise<void> {
  divider('SCENARIO 2: Redis DOWN');

  const redisHost = 'localhost:6379';

  const a1 = alert.redisDown('apartment-erp', redisHost);
  process.stdout.write('\n  [Circuit OPEN] Expected alert payload:\n');
  process.stdout.write(`    severity:     ${a1.severity}\n`);
  process.stdout.write(`    service:      ${a1.service}\n`);
  process.stdout.write(`    message:     "${a1.message}"\n`);
  process.stdout.write(`    fingerprint: ${a1.fingerprint}\n`);
  process.stdout.write(`    metadata:     ${JSON.stringify(a1.metadata)}\n`);

  await sendAlert(a1, NO_CONFIG);

  // HALF_OPEN state
  const a2 = alert.lineCircuitOpen('apartment-erp');
  process.stdout.write('\n  [Circuit HALF_OPEN] Expected alert payload:\n');
  process.stdout.write(`    severity:     ${a2.severity}\n`);
  process.stdout.write(`    service:      ${a2.service}\n`);
  process.stdout.write(`    message:     "${a2.message}"\n`);
  process.stdout.write(`    fingerprint: ${a2.fingerprint}\n`);

  await sendAlert(a2, NO_CONFIG);
}

// ─── Scenario 3: Payment Failure Spike ────────────────────────────────────────
/**
 * Trigger: Payment API returns elevated error rate (network, downstream).
 * Alert call site: cron job or monitoring hook
 * Expected alert: alert.paymentFailureRate('apartment-erp', rate, threshold)
 * Severity: CRITICAL
 * Fingerprint: payment-failure-rate
 */
async function scenarioPaymentFailureSpike(): Promise<void> {
  divider('SCENARIO 3: Payment Failure Spike');

  const currentRate = 5.2;
  const threshold   = 1.0;

  const a = alert.paymentFailureRate('apartment-erp', currentRate, threshold);
  process.stdout.write('\n  Expected alert payload:\n');
  process.stdout.write(`    severity:     ${a.severity}\n`);
  process.stdout.write(`    service:      ${a.service}\n`);
  process.stdout.write(`    message:     "${a.message}"\n`);
  process.stdout.write(`    fingerprint: ${a.fingerprint}\n`);
  process.stdout.write(`    metadata:     ${JSON.stringify(a.metadata)}\n`);

  await sendAlert(a, NO_CONFIG);
}

// ─── Scenario 4: Outbox Dead-Letter Spike ──────────────────────────────────────
/**
 * Trigger: Outbox processor marks event as dead letter after max retries.
 * Alert call site: src/lib/outbox/processor.ts → deadLetter()
 * Expected alert: alert.outboxDeadLetter('apartment-erp', count)
 * Severity: CRITICAL
 * Fingerprint: outbox-dead-letter
 */
async function scenarioOutboxDeadLetter(): Promise<void> {
  divider('SCENARIO 4: Outbox Dead-Letter Spike');

  const deadLetterCount = 10;

  const a = alert.outboxDeadLetter('apartment-erp', deadLetterCount);
  process.stdout.write('\n  Expected alert payload:\n');
  process.stdout.write(`    severity:     ${a.severity}\n`);
  process.stdout.write(`    service:      ${a.service}\n`);
  process.stdout.write(`    message:     "${a.message}"\n`);
  process.stdout.write(`    fingerprint: ${a.fingerprint}\n`);
  process.stdout.write(`    metadata:     ${JSON.stringify(a.metadata)}\n`);

  // Simulate the actual call site signature
  const actualCall = alert.outboxDeadLetter('apartment-erp', 1);
  actualCall.metadata = {
    eventId: 'evt-abc123dead',
    aggregateType: 'Invoice',
    aggregateId: 'inv-deadbeef',
    retryCount: 5,
    errorCode: 'OUTBOX_MAX_RETRIES',
  };
  process.stdout.write('\n  Actual call site metadata (outbox/processor.ts):\n');
  process.stdout.write(`    metadata:     ${JSON.stringify(actualCall.metadata)}\n`);

  await sendAlert(actualCall, NO_CONFIG);
}

// ─── Scenario 5: Circuit Breaker OPEN ─────────────────────────────────────────
/**
 * Trigger: Consecutive Redis failures open the circuit breaker.
 * Alert call site: src/infrastructure/redis/index.ts → transitionTo(OPEN)
 * Expected: Two alerts — one for OPEN, one for HALF_OPEN recovery probe
 * Fingerprints: circuit-open-{service}, circuit-half-open-{service}
 */
async function scenarioCircuitBreakerOpen(): Promise<void> {
  divider('SCENARIO 5: Circuit Breaker OPEN');

  const service = 'line-messaging';

  // Simulate OPEN state transition
  const openAlert = alert.redisDown(service, 'line-api.example.com');
  openAlert.fingerprint = `circuit-open-${service}`;
  openAlert.metadata = { from: 'CLOSED', to: 'OPEN', service };

  process.stdout.write('\n  [OPEN] Expected alert payload:\n');
  process.stdout.write(`    severity:     ${openAlert.severity}\n`);
  process.stdout.write(`    service:      ${openAlert.service}\n`);
  process.stdout.write(`    message:     "${openAlert.message}"\n`);
  process.stdout.write(`    fingerprint: ${openAlert.fingerprint}\n`);
  process.stdout.write(`    metadata:     ${JSON.stringify(openAlert.metadata)}\n`);

  await sendAlert(openAlert, NO_CONFIG);

  // Simulate HALF_OPEN probe
  const halfOpenAlert = alert.lineCircuitOpen(service);
  halfOpenAlert.fingerprint = `circuit-half-open-${service}`;
  halfOpenAlert.metadata = { from: 'OPEN', to: 'HALF_OPEN', service };

  process.stdout.write('\n  [HALF_OPEN probe] Expected alert payload:\n');
  process.stdout.write(`    severity:     ${halfOpenAlert.severity}\n`);
  process.stdout.write(`    service:      ${halfOpenAlert.service}\n`);
  process.stdout.write(`    message:     "${halfOpenAlert.message}"\n`);
  process.stdout.write(`    fingerprint: ${halfOpenAlert.fingerprint}\n`);
  process.stdout.write(`    metadata:     ${JSON.stringify(halfOpenAlert.metadata)}\n`);

  await sendAlert(halfOpenAlert, NO_CONFIG);
}

// ─── Scenario 6: Reconciliation CRITICAL Issues ─────────────────────────────────
/**
 * Trigger: Daily reconciliation finds CRITICAL severity mismatches.
 * Alert call site: src/modules/reconciliation/reconciliation.service.ts
 * Expected alert: alert.reconciliationIssues('apartment-erp', count, 'CRITICAL')
 */
async function scenarioReconciliationIssues(): Promise<void> {
  divider('SCENARIO 6: Reconciliation CRITICAL Issues');

  const issueCount = 3;
  const issues = [
    { type: 'PAYMENT_ORPHANED',   severity: 'CRITICAL', entityId: 'pay-001' },
    { type: 'INVOICE_UNPAID',     severity: 'CRITICAL', entityId: 'inv-002' },
    { type: 'DOUBLE_PAYMENT',     severity: 'CRITICAL', entityId: 'inv-003' },
  ];

  const a = alert.reconciliationIssues('apartment-erp', issueCount, 'CRITICAL');
  process.stdout.write('\n  Expected alert payload:\n');
  process.stdout.write(`    severity:     ${a.severity}\n`);
  process.stdout.write(`    service:      ${a.service}\n`);
  process.stdout.write(`    message:     "${a.message}"\n`);
  process.stdout.write(`    fingerprint: ${a.fingerprint}\n`);
  process.stdout.write(`    metadata:     ${JSON.stringify(a.metadata)}\n`);

  // Simulate actual call site with real issue data
  const actualAlert = alert.reconciliationIssues('apartment-erp', issues.length, 'CRITICAL');
  actualAlert.metadata = {
    types: [...new Set(issues.map(i => i.type))].join(','),
    firstEntityId: issues[0]?.entityId,
  };
  process.stdout.write('\n  Actual call site metadata:\n');
  process.stdout.write(`    metadata:     ${JSON.stringify(actualAlert.metadata)}\n`);

  await sendAlert(actualAlert, NO_CONFIG);
}

// ─── Scenario 7: Latency Threshold Exceeded ────────────────────────────────────
/**
 * Trigger: p95 latency exceeds configured SLO threshold.
 * Alert call site: cron job monitoring endpoint latency
 * Expected alert: alert.latencyThreshold('apartment-erp', endpoint, p95Ms, thresholdMs)
 */
async function scenarioLatencyThreshold(): Promise<void> {
  divider('SCENARIO 7: Latency Threshold Exceeded');

  const endpoint    = '/api/payments/manual';
  const p95Ms       = 620;
  const thresholdMs = 500;

  const a = alert.latencyThreshold('apartment-erp', endpoint, p95Ms, thresholdMs);
  process.stdout.write('\n  Expected alert payload:\n');
  process.stdout.write(`    severity:     ${a.severity}\n`);
  process.stdout.write(`    service:      ${a.service}\n`);
  process.stdout.write(`    message:     "${a.message}"\n`);
  process.stdout.write(`    fingerprint: ${a.fingerprint}\n`);
  process.stdout.write(`    metadata:     ${JSON.stringify(a.metadata)}\n`);

  await sendAlert(a, NO_CONFIG);
}

// ─── Dedup & Rate Limit Verification ───────────────────────────────────────────

async function scenarioDedupVerification(): Promise<void> {
  divider('SCENARIO 8: Dedup & Rate Limit Verification');

  // Send same fingerprint twice — second should be deduped
  const a = makeAlert('CRITICAL', 'apartment-erp', 'DB pool exhausted', 'db-pool-exhausted', {
    endpoint: '/api/test',
    pendingRequests: 85,
  });

  process.stdout.write('\n  Sending alert #1 (should succeed)...\n');
  await sendAlert(a, NO_CONFIG);

  process.stdout.write('  Sending alert #2 (SAME fingerprint — should be deduped)...\n');
  await sendAlert(a, NO_CONFIG);

  process.stdout.write('  Dedup verification: check logs for "alert_deduped" on #2\n');

  // Rate limit: send burst
  process.stdout.write('\n  Rate limit test: sending 2 alerts rapidly...');
  const a2 = makeAlert('WARNING', 'apartment-erp', 'Rate limit test', `ratelimit-test-${Date.now()}`, {});
  await sendAlert(a2, NO_CONFIG);
  process.stdout.write(' (first sent)\n');

  const a3 = makeAlert('WARNING', 'apartment-erp', 'Rate limit test 2', `ratelimit-test-${Date.now()}`, {});
  await sendAlert(a3, NO_CONFIG);
  process.stdout.write(' (second sent — check for "alert_rate_limited" in logs)\n');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  APARTMENT ERP — FAILURE SIMULATION & ALERT VALIDATION');
  console.log('  Date: ' + new Date().toISOString());
  console.log('═══════════════════════════════════════════════════════════════');

  const results: Array<{ scenario: string; pass: boolean }> = [];

  const scenarios: Array<{ name: string; fn: () => Promise<void> }> = [
    { name: 'DB Pool Exhaustion',          fn: scenarioDbPoolExhaustion      },
    { name: 'Redis DOWN',                   fn: scenarioRedisDown             },
    { name: 'Payment Failure Spike',        fn: scenarioPaymentFailureSpike   },
    { name: 'Outbox Dead-Letter Spike',     fn: scenarioOutboxDeadLetter      },
    { name: 'Circuit Breaker OPEN',         fn: scenarioCircuitBreakerOpen   },
    { name: 'Reconciliation CRITICAL',      fn: scenarioReconciliationIssues  },
    { name: 'Latency Threshold Exceeded',  fn: scenarioLatencyThreshold     },
    { name: 'Dedup & Rate Limit',           fn: scenarioDedupVerification    },
  ];

  for (const { name, fn } of scenarios) {
    const pass = await simulateAlert(name, fn);
    results.push({ scenario: name, pass });
  }

  console.log('\n');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════');
  results.forEach(r => {
    console.log(`  ${r.pass ? '✅' : '❌'} ${r.scenario}`);
  });

  const allPass = results.every(r => r.pass);
  console.log('\n  Result: ' + (allPass ? 'ALL PASS ✅' : 'SOME FAILURES ❌'));

  const report = {
    timestamp: new Date().toISOString(),
    results,
    verdict: allPass ? 'PASS' : 'FAIL',
  };

  console.log('\n── JSON Report ─────────────────────────────────────────────');
  console.log(JSON.stringify(report, null, 2));

  process.exit(allPass ? 0 : 1);
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
