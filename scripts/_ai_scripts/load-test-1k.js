/**
 * Production Load Test — 1000 VUs, mixed endpoints
 *
 * Usage: node scripts/load-test-1k.js
 * Requires: server running on localhost:3001
 */

const BASE = process.env.BASE_URL || 'http://localhost:3001';
const TARGET_VU = 1000;
const WAVES = 20;           // waves to ramp up
const VU_PER_WAVE = TARGET_VU / WAVES;
const SLO_P95_MS = 500;
const SLO_ERROR_RATE = 0.01; // 1%

// ── Auth helper ─────────────────────────────────────────────────────────────

function httpRequest(url, options = {}) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const req = http.request({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });
    req.on('error', (err) => resolve({ status: 0, error: err.message }));
    req.setTimeout(10000, () => { req.destroy(); resolve({ status: 0, error: 'timeout' }); });
    if (options.body) req.write(options.body);
    req.end();
  });
}

const http = require('http');

async function login() {
  const res = await httpRequest(`${BASE}/api/auth/login`, {
    method: 'POST',
    body: JSON.stringify({ username: 'owner', password: 'Owner@12345' }),
  });
  if (res.status !== 200) throw new Error(`Login failed: ${res.status}`);
  const cookie = typeof res.data === 'object' && res.data.success
    ? res.headers?.['set-cookie'] || res.headers?.['Set-Cookie'] || ''
    : '';
  return Array.isArray(cookie) ? cookie.join('; ') : cookie;
}

async function fetchWithCookie(url, cookie) {
  return httpRequest(url, { headers: { Cookie: cookie } });
}

// ── Latency tracker ─────────────────────────────────────────────────────────

const latencies = [];
const errors = [];
let completed = 0;

function record(status, ms, isError = false) {
  latencies.push(ms);
  completed++;
  if (isError || status >= 500) errors.push({ status, ms });
}

// ── Worker ───────────────────────────────────────────────────────────────────

async function vuWorker(id, cookie) {
  const endpoints = [
    [`${BASE}/api/health`, false],
    [`${BASE}/api/invoices`, true],
  ];

  for (const [url, needsAuth] of endpoints) {
    const t0 = Date.now();
    let res;
    if (needsAuth) {
      res = await fetchWithCookie(url, cookie);
    } else {
      res = await httpRequest(url);
    }
    const ms = Date.now() - t0;
    record(res.status, ms, res.error != null);
  }
}

// ── Run ─────────────────────────────────────────────────────────────────────

async function run() {
  console.log(`\n=== Production Load Test ===`);
  console.log(`Target: ${TARGET_VU} VUs | Waves: ${WAVES} | SLO: p95<${SLO_P95_MS}ms, errors<${SLO_ERROR_RATE * 100}%`);
  console.log(`BASE: ${BASE}\n`);

  process.stdout.write('Logging in... ');
  let cookie;
  try {
    cookie = await login();
    console.log('OK');
  } catch (e) {
    console.log(`FAILED: ${e.message}`);
    process.exit(1);
  }

  console.log(`Launching ${TARGET_VU} VUs in ${WAVES} waves...\n`);

  const waveStart = Date.now();

  for (let w = 1; w <= WAVES; w++) {
    const wavePromises = [];
    for (let i = 0; i < VU_PER_WAVE; i++) {
      wavePromises.push(vuWorker((w - 1) * VU_PER_WAVE + i, cookie).catch(() => {}));
    }
    await Promise.all(wavePromises);
    process.stdout.write(`Wave ${w}/${WAVES} done (${completed} requests)\n`);
  }

  const totalMs = Date.now() - waveStart;

  // ── Stats ─────────────────────────────────────────────────────────────────

  latencies.sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.50)];
  const p95 = latencies[Math.floor(latencies.length * 0.95)];
  const p99 = latencies[Math.floor(latencies.length * 0.99)];
  const max = latencies[latencies.length - 1];
  const errorRate = errors.length / completed;
  const throughput = (completed / (totalMs / 1000)).toFixed(1);

  console.log(`\n=== Results ===`);
  console.log(`Total requests : ${completed}`);
  console.log(`Total time     : ${totalMs}ms`);
  console.log(`Throughput     : ${throughput} req/s`);
  console.log(`Error count    : ${errors.length} (${(errorRate * 100).toFixed(2)}%)`);
  console.log(`\nLatency:`);
  console.log(`  p50  : ${p50}ms`);
  console.log(`  p95  : ${p95}ms  ${p95 <= SLO_P95_MS ? '✅' : '❌'}`);
  console.log(`  p99  : ${p99}ms`);
  console.log(`  max  : ${max}ms`);

  const pass = p95 <= SLO_P95_MS && errorRate <= SLO_ERROR_RATE;
  console.log(`\n${pass ? '✅ PASS' : '❌ FAIL'} — SLO: p95≤${SLO_P95_MS}ms, errors≤${SLO_ERROR_RATE * 100}%`);
  process.exit(pass ? 0 : 1);
}

run().catch(e => { console.error(e); process.exit(1); });