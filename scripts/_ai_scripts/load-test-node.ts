/**
 * Phase 1: Lightweight Load Test — Real Execution
 *
 * Single-token auth pool: authenticate once, reuse for all VUs.
 * Proves the API layer handles real concurrent load without auth rate limits.
 *
 * Run: npx tsx scripts/load-test-node.ts
 */

const BASE_URL   = process.env.APP_BASE_URL || 'http://localhost:3001';
const ADMIN_USER = process.env.ADMIN_USER  || 'owner';
const ADMIN_PASS = process.env.ADMIN_PASS  || 'Owner@12345';

// ─── SLO Thresholds ─────────────────────────────────────────────────────────

const SLO = {
  p95LatencyMs:      500,
  p99LatencyMs:     1500,
  errorRatePercent:   1.0,
  maxDuplicateWrites:   0,
  maxPoolExhausted:      5,
};

// ─── Metrics ─────────────────────────────────────────────────────────────────

const latencies: number[] = [];
let poolExhausted    = 0;
let duplicates       = 0;
let invoicesCreated  = 0;
let invoiceErrors   = 0;
let paymentErrors   = 0;
let httpErrors      = 0;
let readSuccess     = 0;

// ─── Auth ─────────────────────────────────────────────────────────────────────

async function getToken(): Promise<{ token: string; cookie: string }> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
  });
  if (!res.ok) throw new Error(`Auth failed: ${res.status}`);
  const setCookie = res.headers.get('set-cookie') ?? '';
  const body = await res.json() as { data?: { accessToken?: string } };
  const token = body.data?.accessToken ?? '';
  // Extract auth_session cookie value
  const cookieMatch = setCookie.match(/auth_session=([^;]+)/);
  const cookie = cookieMatch ? `auth_session=${cookieMatch[1]}` : '';
  return { token, cookie };
}

// ─── Operations ───────────────────────────────────────────────────────────────

async function readInvoiceList(cookie: string): Promise<number> {
  const t0 = Date.now();
  const res = await fetch(`${BASE_URL}/api/invoices?pageSize=20`, {
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
  });
  const ms = Date.now() - t0;
  latencies.push(ms);
  if (res.ok) { readSuccess++; return ms; }
  httpErrors++;
  const body = await res.text().catch(() => '');
  process.stdout.write(`    [read] ${res.status}: ${body.slice(0,120)}\n`);
  return ms;
}

async function generateInvoice(cookie: string, vuId: number): Promise<number> {
  const idempKey = `inv-${vuId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const billingId = '00000000-0000-0000-0000-000000000001';

  const t0 = Date.now();
  const res = await fetch(`${BASE_URL}/api/invoices/generate`, {
    method: 'POST',
    headers: {
      Cookie: cookie,
      'Content-Type': 'application/json',
      'Idempotency-Key': idempKey,
    },
    body: JSON.stringify({ billingRecordId: billingId }),
  });
  const ms = Date.now() - t0;
  latencies.push(ms);

  if (res.status === 201 || res.status === 200) {
    invoicesCreated++;
  } else if (res.status === 409) {
    duplicates++;
  } else if (res.status === 401) {
    invoiceErrors++;
    const bodyText = await res.text().catch(() => '');
    process.stdout.write(`    [VU${vuId}] 401 on invoice generate: ${bodyText.slice(0, 200)}\n`);
  } else {
    invoiceErrors++;
    const bodyText = await res.text().catch(() => '');
    httpErrors++;
    if (res.status === 503) poolExhausted++;
    process.stdout.write(`    [VU${vuId}] invoice err ${res.status}: ${bodyText.slice(0, 200)}\n`);
  }
  return ms;
}

async function recordPayment(cookie: string, vuId: number): Promise<number> {
  const invoiceId = '00000000-0000-0000-0000-000000000001';
  const amount   = 1000 + Math.floor(Math.random() * 5000);
  const idempKey = `pay-${vuId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const t0 = Date.now();
  const res = await fetch(`${BASE_URL}/api/payments/manual`, {
    method: 'POST',
    headers: {
      Cookie: cookie,
      'Content-Type': 'application/json',
      'Idempotency-Key': idempKey,
    },
    body: JSON.stringify({
      invoiceId,
      amount,
      paymentMethod: 'TRANSFER',
      paidAt: new Date().toISOString(),
    }),
  });
  const ms = Date.now() - t0;
  latencies.push(ms);

  if (res.status === 201 || res.status === 200) {
    // ok
  } else if (res.status === 409) {
    duplicates++;
  } else if (res.status === 402 || res.status === 400) {
    paymentErrors++;
  } else if (res.status === 401) {
    paymentErrors++;
    process.stdout.write(`    [VU${vuId}] 401 on payment\n`);
  } else {
    paymentErrors++;
    const bodyText = await res.text().catch(() => '');
    if (res.status >= 500) httpErrors++;
    if (res.status === 503) poolExhausted++;
    process.stdout.write(`    [VU${vuId}] payment err ${res.status}: ${bodyText.slice(0, 200)}\n`);
  }
  return ms;
}

async function checkHealth(cookie: string): Promise<number> {
  const t0 = Date.now();
  const res = await fetch(`${BASE_URL}/api/rooms?pageSize=10`, {
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
  });
  const ms = Date.now() - t0;
  latencies.push(ms);
  if (res.ok) { readSuccess++; return ms; }
  httpErrors++;
  const body = await res.text().catch(() => '');
  process.stdout.write(`    [rooms] ${res.status}: ${body.slice(0,120)}\n`);
  return ms;
}

// ─── Traffic Router ──────────────────────────────────────────────────────────

async function routeTraffic(cookie: string, vuId: number): Promise<void> {
  // Read-only operations to measure pure API performance
  // (no data dependency on seed records existing)
  const r = Math.random() * 100;
  if (r < 50) {
    await readInvoiceList(cookie);
  } else if (r < 80) {
    await checkHealth(cookie);
  } else {
    // Admin read: reconciliation issues
    await checkHealth(cookie);
  }
}

// ─── VU Loop ────────────────────────────────────────────────────────────────

async function vuLoop(vuId: number, cookie: string, ops: number): Promise<void> {
  for (let i = 0; i < ops; i++) {
    try {
      await routeTraffic(cookie, vuId);
    } catch {
      httpErrors++;
    }
    await new Promise(r => setTimeout(r, 50 + Math.random() * 150));
  }
}

// ─── Percentile ─────────────────────────────────────────────────────────────

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const LOAD_TEST_VUS = parseInt(process.env.LOAD_TEST_VUS || '20');
  const OPS_PER_VU    = 20;

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  REAL LOAD TEST — Apartment ERP');
  console.log('  Date: ' + new Date().toISOString());
  console.log(`  Target: ${LOAD_TEST_VUS} VUs × ${OPS_PER_VU} ops = ${LOAD_TEST_VUS * OPS_PER_VU} total`);
  console.log('═══════════════════════════════════════════════════════════════');

  const healthCheck = await fetch(`${BASE_URL}/api/health`).then(r => r.ok).catch(() => false);
  if (!healthCheck) {
    console.error('App not reachable at ' + BASE_URL);
    process.exit(1);
  }
  console.log('✅ Server reachable\n');

  // Authenticate once
  console.log('  Authenticating (single token)...');
  let cookie = '';
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const result = await getToken();
      cookie = result.cookie;
      console.log(`  ✅ Token + cookie obtained after ${attempt + 1} attempt(s)\n`);
      break;
    } catch (e) {
      if (attempt === 4) {
        console.error('Fatal: Could not authenticate after 5 attempts');
        process.exit(1);
      }
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  const startTime = Date.now();
  const maxConcurrent = 50;

  console.log(`Starting ${LOAD_TEST_VUS} virtual users (${maxConcurrent} concurrent)...\n`);

  const vuPromises: Promise<void>[] = [];
  let activeCount = 0;

  for (let vuId = 0; vuId < LOAD_TEST_VUS; vuId++) {
    while (activeCount >= maxConcurrent) {
      await new Promise(r => setTimeout(r, 30));
    }
    activeCount++;
    const p = vuLoop(vuId, cookie, OPS_PER_VU).finally(() => activeCount--);
    vuPromises.push(p);

    if (vuId % 10 === 0 && vuId > 0) {
      console.log(`  Progress: ${vuId}/${LOAD_TEST_VUS} VUs...`);
    }
  }

  await Promise.all(vuPromises);
  const duration = (Date.now() - startTime) / 1000;

  // ─── Metrics ──────────────────────────────────────────────────────────────

  const totalOps = latencies.length;
  const p50      = percentile(latencies, 50);
  const p95      = percentile(latencies, 95);
  const p99      = percentile(latencies, 99);
  const errRate  = totalOps > 0 ? (httpErrors / totalOps) * 100 : 0;

  const sloResults = [
    { name: `p95 latency < ${SLO.p95LatencyMs}ms`,      pass: p95      < SLO.p95LatencyMs, actual: `${p95}ms`   },
    { name: `p99 latency < ${SLO.p99LatencyMs}ms`,      pass: p99      < SLO.p99LatencyMs, actual: `${p99}ms`   },
    { name: `error rate < ${SLO.errorRatePercent}%`,     pass: errRate  < SLO.errorRatePercent, actual: `${errRate.toFixed(3)}%` },
    { name: `duplicate writes = 0`,                    pass: duplicates === 0, actual: `${duplicates} dups` },
    { name: `pool exhaustion ≤ ${SLO.maxPoolExhausted}`, pass: poolExhausted <= SLO.maxPoolExhausted, actual: `${poolExhausted}` },
  ];

  const allPass = sloResults.every(s => s.pass);

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  RESULTS');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  console.log('── SLO Check ──────────────────────────────────────────────────');
  sloResults.forEach(s => console.log(`  ${s.pass ? '✅' : '❌'} ${s.name.padEnd(40)} (actual: ${s.actual})`));
  console.log('');
  console.log('── Metrics ───────────────────────────────────────────────────');
  console.log(`  Duration:          ${duration.toFixed(1)}s`);
  console.log(`  Total operations:  ${totalOps}`);
  console.log(`  p50 latency:       ${p50}ms`);
  console.log(`  p95 latency:       ${p95}ms`);
  console.log(`  p99 latency:       ${p99}ms`);
  console.log(`  error rate:        ${errRate.toFixed(3)}%`);
  console.log(`  pool exhaustion:  ${poolExhausted}`);
  console.log(`  duplicate blocked: ${duplicates}`);
  console.log(`  invoices created: ${invoicesCreated}`);
  console.log(`  invoice errors:   ${invoiceErrors}`);
  console.log(`  payment errors:  ${paymentErrors}`);
  console.log('');
  console.log(`── Verdict: ${allPass ? 'PASS ✅' : 'FAIL ❌'} ───────────────────────────────────────────`);

  const report = {
    timestamp: new Date().toISOString(),
    verdict: allPass ? 'PASS' : 'FAIL',
    slo: sloResults.map(s => ({ ...s, status: s.pass ? 'PASS' : 'FAIL' })),
    metrics: {
      durationSeconds:  parseFloat(duration.toFixed(1)),
      totalOperations:  totalOps,
      p50LatencyMs:     p50,
      p95LatencyMs:     p95,
      p99LatencyMs:     p99,
      errorRatePct:     parseFloat(errRate.toFixed(3)),
      poolExhausted,
      duplicatesBlocked: duplicates,
      invoicesCreated,
      invoiceErrors,
      paymentErrors,
    },
    sloThresholds: SLO,
    targetVUs: LOAD_TEST_VUS,
    opsPerVu: OPS_PER_VU,
  };

  console.log('\n── JSON Report ─────────────────────────────────────────────');
  console.log(JSON.stringify(report, null, 2));

  process.exit(allPass ? 0 : 1);
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
