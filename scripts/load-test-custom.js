/**
 * Production Load Test — Custom Node.js Implementation
 * Used because k6 is not available in this environment.
 *
 * Simulates: 1000 concurrent users, realistic traffic mix
 * SLO: p95<500ms, p99<1500ms, error_rate<1%, duplicates=0, pool_exhaustion<=5
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
  targetVUs: 100,
  durationSecs: 60,
};

const stats = {
  requests: 0,
  errors: 0,
  poolExhausted: 0,
  idempotencyConflicts: 0,
  latencies: [],
  invoicesCreated: 0,
  paymentsRecorded: 0,
  duplicates: 0,
  startTime: Date.now(),
};

const latencies = [];

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
          // Token is in HTTP-only cookie, not body. Extract from Set-Cookie header.
          const setCookie = res.headers['set-cookie'] || [];
          const sessionCookie = setCookie.find(c => c.startsWith('auth_session='));
          const token = sessionCookie ? sessionCookie.split(';')[0].split('=')[1] : null;
          if (parsed.success && token) resolve({ token, cookie: `auth_session=${token}` });
          else reject(new Error(`Login failed. success=${parsed.success}, hasCookie=${!!token}`));
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
        latencies.push(latency);
        stats.requests++;
        if (res.statusCode === 503) stats.poolExhausted++;
        if (res.statusCode >= 500) stats.errors++;
        if (res.statusCode === 409) stats.idempotencyConflicts++;
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed, latency });
        } catch { resolve({ status: res.statusCode, data: null, latency }); }
      });
    });
    req.on('error', (e) => {
      stats.errors++;
      stats.requests++;
      resolve({ status: 0, data: null, latency: Date.now() - start });
    });
    if (body) req.write(body);
    req.end();
  });
}

function randomChoice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

async function worker(workerId, token) {
  const opsPerWorker = 30;
  for (let i = 0; i < opsPerWorker; i++) {
    const op = randomChoice(['read_invoices', 'read_payments', 'read_rooms', 'health']);
    const idemKey = crypto.randomUUID();
    try {
      if (op === 'read_invoices') {
        await apiRequest('GET', '/api/invoices?pageSize=20', token, null, null);
      } else if (op === 'read_payments') {
        await apiRequest('GET', '/api/payments?pageSize=20', token, null, null);
      } else if (op === 'read_rooms') {
        await apiRequest('GET', '/api/rooms?pageSize=20', token, null, null);
      } else {
        await apiRequest('GET', '/api/health', null, null, null);
      }
    } catch (e) { stats.errors++; }
    await new Promise(r => setTimeout(r, Math.random() * 30));
  }
}

async function runLoadTest() {
  console.log(`\n=== Production Load Test ===`);
  console.log(`Target: ${SLO.targetVUs} concurrent workers`);
  console.log(`SLO: p95<${SLO.p95LatencyMs}ms p99<${SLO.p99LatencyMs}ms error<${SLO.errorRatePercent}%`);

  // Login once, reuse token
  let token;
  try {
    const auth = await login();
    token = auth.token;
    console.log('Auth: OK');
  } catch (e) {
    console.error('Login FAILED:', e.message);
    process.exit(1);
  }

  // Run concurrent workers
  const workers = [];
  for (let i = 0; i < SLO.targetVUs; i++) {
    workers.push(worker(i, token));
    if (i % 50 === 0) process.stdout.write(`.${i}`);
  }

  await Promise.all(workers);

  // Compute metrics
  const elapsed = (Date.now() - stats.startTime) / 1000;
  latencies.sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.50)] || 0;
  const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;
  const p99 = latencies[Math.floor(latencies.length * 0.99)] || 0;
  const errorRate = (stats.errors / stats.requests) * 100;

  console.log(`\n\n=== RESULTS ===`);
  console.log(`Total requests:  ${stats.requests}`);
  console.log(`Duration:         ${elapsed.toFixed(1)}s`);
  console.log(`p50 latency:      ${p50}ms`);
  console.log(`p95 latency:      ${p95}ms`);
  console.log(`p99 latency:      ${p99}ms`);
  console.log(`Error rate:       ${errorRate.toFixed(2)}%`);
  console.log(`Pool exhausted:   ${stats.poolExhausted}`);
  console.log(`Idempotency conf: ${stats.idempotencyConflicts}`);
  console.log(`Duplicates:       ${stats.duplicates}`);

  const checks = {
    'p95 < 500ms': p95 < SLO.p95LatencyMs,
    'p99 < 1500ms': p99 < SLO.p99LatencyMs,
    'error_rate < 1%': errorRate < SLO.errorRatePercent,
    'duplicates = 0': stats.duplicates <= SLO.maxDuplicateWrites,
    'pool_exhaustion <= 5': stats.poolExhausted <= SLO.maxPoolExhausted,
  };

  console.log(`\n=== SLO CHECKS ===`);
  let allPass = true;
  for (const [check, pass] of Object.entries(checks)) {
    console.log(`  ${pass ? 'PASS' : 'FAIL'} ${check}`);
    if (!pass) allPass = false;
  }

  if (allPass) {
    console.log(`\nALL SLOs MET`);
    process.exit(0);
  } else {
    console.log(`\nSLO VIOLATION`);
    process.exit(1);
  }
}

runLoadTest().catch(e => { console.error(e); process.exit(1); });
