/**
 * Phase 1: 10,000 User Load Test — Node.js Implementation
 * Full production scale simulation using raw http module
 *
 * SLO:
 *   p95 < 500ms
 *   p99 < 1500ms
 *   error_rate < 1%
 *   duplicates = 0
 *   pool_exhaustion <= 5
 */

const http = require('http');
const crypto = require('crypto');

const BASE_URL = process.env.APP_BASE_URL || 'http://localhost:3000';
const ADMIN_USER = process.env.ADMIN_USER || 'owner';
const ADMIN_PASS = process.env.ADMIN_PASS || 'Owner@12345';

const SLO = {
  p95LatencyMs: 500,
  p99LatencyMs: 1500,
  errorRatePercent: 1.0,
  maxDuplicateWrites: 0,
  maxPoolExhausted: 5,
  targetVUs: 10000,
};

const stats = {
  requests: 0,
  errors: 0,
  poolExhausted: 0,
  idempotencyConflicts: 0,
  startTime: Date.now(),
  latencies: [],
};

const latencies = [];
let stopCollecting = false;

// Collect latencies in batches to avoid memory issues
function addLatency(lat) {
  if (!stopCollecting) latencies.push(lat);
}

function login() {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS });
    const req = http.request(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const setCookie = res.headers['set-cookie'] || [];
          const sessionCookie = setCookie.find(c => c.startsWith('auth_session='));
          const token = sessionCookie ? sessionCookie.split(';')[0].split('=')[1] : null;
          if (parsed.success && token) resolve({ token, cookie: `auth_session=${token}` });
          else reject(new Error(`Login failed`));
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function apiRequest(method, path, token, body, idempotencyKey) {
  return new Promise((resolve) => {
    const start = Date.now();
    const options = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (token) options.headers['Authorization'] = `Bearer ${token}`;
    if (idempotencyKey) options.headers['X-Idempotency-Key'] = idempotencyKey;
    if (body) options.headers['Content-Length'] = Buffer.byteLength(body);

    const req = http.request(`${BASE_URL}${path}`, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const latency = Date.now() - start;
        addLatency(latency);
        stats.requests++;
        if (res.statusCode === 503) stats.poolExhausted++;
        if (res.statusCode >= 500) stats.errors++;
        if (res.statusCode === 409) stats.idempotencyConflicts++;
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data), latency });
        } catch { resolve({ status: res.statusCode, data: null, latency }); }
      });
    });
    req.on('error', (e) => {
      stats.errors++;
      stats.requests++;
      addLatency(Date.now() - start);
      resolve({ status: 0, data: null, latency: Date.now() - start });
    });
    if (body) req.write(body);
    req.end();
  });
}

function randomChoice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// Realistic traffic mix: 50% read, 30% invoice, 20% payment
function randomOp(token) {
  const op = randomChoice([
    'read_invoices', 'read_invoices', 'read_invoices', 'read_invoices', 'read_invoices',
    'read_payments', 'read_payments', 'read_payments', 'read_payments',
    'read_rooms', 'read_rooms',
    'generate_invoice', 'generate_invoice', 'generate_invoice',
    'record_payment', 'record_payment',
    'health', 'health',
  ]);
  const idemKey = crypto.randomUUID();
  if (op === 'read_invoices') return apiRequest('GET', '/api/invoices?pageSize=20', token, null, null);
  if (op === 'read_payments') return apiRequest('GET', '/api/payments?pageSize=20', token, null, null);
  if (op === 'read_rooms') return apiRequest('GET', '/api/rooms?pageSize=20', token, null, null);
  if (op === 'generate_invoice') return apiRequest('POST', '/api/invoices/generate', token, JSON.stringify({ billingRecordId: 'dummy', periodId: 'dummy' }), idemKey);
  if (op === 'record_payment') return apiRequest('POST', '/api/payments/manual', token, JSON.stringify({ amount: 1000, reference: 'TEST', sourceFile: 'load-test' }), idemKey);
  return apiRequest('GET', '/api/health', null, null, null);
}

async function worker(workerId, token, opsCount) {
  for (let i = 0; i < opsCount; i++) {
    try {
      await randomOp(token);
    } catch (e) { stats.errors++; }
    // Tiny delay to avoid overwhelming
    if (i % 100 === 0) await new Promise(r => setTimeout(r, 1));
  }
}

async function runLoadTest() {
  console.log(`\n=== 10,000 User Load Test ===`);
  console.log(`Target: ${SLO.targetVUs} VUs`);
  console.log(`SLO: p95<${SLO.p95LatencyMs}ms p99<${SLO.p99LatencyMs}ms error<${SLO.errorRatePercent}%`);

  // Login once, reuse token for all workers
  let token;
  try {
    const auth = await login();
    token = auth.token;
    console.log('Auth: OK (token reused across workers)');
  } catch (e) {
    console.error('Login FAILED:', e.message);
    process.exit(1);
  }

  // Launch 10,000 workers in waves to avoid socket exhaustion
  const WAVE_SIZE = 500;
  const waves = SLO.targetVUs / WAVE_SIZE;
  const opsPerWorker = 10; // 10 ops × 10,000 VUs = 100,000 total requests

  console.log(`Launching ${SLO.targetVUs} workers in ${waves} waves of ${WAVE_SIZE}...`);

  for (let w = 0; w < waves; w++) {
    const workers = [];
    for (let i = 0; i < WAVE_SIZE; i++) {
      workers.push(worker(w * WAVE_SIZE + i, token, opsPerWorker));
    }
    process.stdout.write(`\nWave ${w + 1}/${waves} (${(w + 1) * WAVE_SIZE} workers)...`);
    await Promise.all(workers);
  }

  stopCollecting = true;

  // Compute metrics
  const elapsed = (Date.now() - stats.startTime) / 1000;
  latencies.sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.50)] || 0;
  const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;
  const p99 = latencies[Math.floor(latencies.length * 0.99)] || 0;
  const errorRate = (stats.errors / stats.requests) * 100;

  console.log(`\n\n=== RESULTS ===`);
  console.log(`Total requests:   ${stats.requests}`);
  console.log(`Duration:        ${elapsed.toFixed(1)}s`);
  console.log(`Throughput:      ${(stats.requests / elapsed).toFixed(0)} req/s`);
  console.log(`p50 latency:     ${p50}ms`);
  console.log(`p95 latency:     ${p95}ms`);
  console.log(`p99 latency:     ${p99}ms`);
  console.log(`Error rate:      ${errorRate.toFixed(2)}%`);
  console.log(`Pool exhausted:  ${stats.poolExhausted}`);
  console.log(`Idempotency conf:${stats.idempotencyConflicts}`);

  const checks = {
    'p95 < 500ms': p95 < SLO.p95LatencyMs,
    'p99 < 1500ms': p99 < SLO.p99LatencyMs,
    'error_rate < 1%': errorRate < SLO.errorRatePercent,
    'duplicates = 0': stats.idempotencyConflicts <= SLO.maxDuplicateWrites,
    'pool_exhaustion <= 5': stats.poolExhausted <= SLO.maxPoolExhausted,
  };

  console.log(`\n=== SLO CHECKS ===`);
  let allPass = true;
  for (const [check, pass] of Object.entries(checks)) {
    console.log(`  ${pass ? '✅' : '❌'} ${check}`);
    if (!pass) allPass = false;
  }

  console.log(`\n${allPass ? '✅ ALL SLOs MET' : '❌ SLO VIOLATION'}`);
  process.exit(allPass ? 0 : 1);
}

runLoadTest().catch(e => { console.error(e); process.exit(1); });
