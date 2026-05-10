/**
 * Smoke test — runs against a live server after build+migrate+seed.
 * Exits with code 1 if any critical path fails.
 *
 * Usage: npx tsx tests/smoke-test.ts
 * Env:   APP_BASE_URL  (default: http://localhost:3001)
 *        SMOKE_USERNAME (default: owner)
 *        SMOKE_PASSWORD (default: Owner@12345)
 */

const BASE = (process.env.APP_BASE_URL ?? 'http://localhost:3001').replace(/\/$/, '');
const USERNAME = process.env.SMOKE_USERNAME ?? 'owner';
const PASSWORD = process.env.SMOKE_PASSWORD ?? 'Owner@12345';

interface Check {
  name: string;
  fn: () => Promise<void>;
}

async function get(path: string, cookie: string): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    headers: { Cookie: cookie, Accept: 'application/json' },
  });
}

async function assertOk(res: Response, label: string): Promise<unknown> {
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = await res.json() as { success?: boolean; data?: unknown };
  if (json.success === false) throw new Error(`success=false: ${JSON.stringify(json).slice(0, 200)}`);
  return json.data;
}

async function run(): Promise<void> {
  let sessionCookie = '';

  const checks: Check[] = [
    {
      name: 'Health endpoint responds 200',
      fn: async () => {
        const res = await fetch(`${BASE}/api/health`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = await res.json() as { status?: string };
        if (body.status !== 'ok') throw new Error(`status=${body.status}`);
      },
    },
    {
      name: 'Login returns session cookie',
      fn: async () => {
        const res = await fetch(`${BASE}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
        });
        if (!res.ok) throw new Error(`Login HTTP ${res.status}`);
        const setCookie = res.headers.get('set-cookie') ?? '';
        if (!setCookie.includes('auth_session')) throw new Error('No auth_session cookie in response');
        const match = setCookie.match(/auth_session=[^;]+/);
        if (!match) throw new Error('Could not parse auth_session cookie');
        sessionCookie = match[0];
      },
    },
    {
      name: '/api/auth/me returns authenticated user',
      fn: async () => {
        const res = await get('/api/auth/me', sessionCookie);
        const data = await assertOk(res, 'auth/me') as { authenticated?: boolean };
        if (!data || !(data as any).authenticated) throw new Error('authenticated=false');
      },
    },
    {
      name: '/api/rooms returns room list',
      fn: async () => {
        const res = await get('/api/rooms', sessionCookie);
        await assertOk(res, 'rooms');
      },
    },
    {
      name: '/api/tenants returns tenant list',
      fn: async () => {
        const res = await get('/api/tenants', sessionCookie);
        await assertOk(res, 'tenants');
      },
    },
    {
      name: '/api/contracts returns contract list',
      fn: async () => {
        const res = await get('/api/contracts', sessionCookie);
        await assertOk(res, 'contracts');
      },
    },
    {
      name: '/api/billing/periods returns billing periods',
      fn: async () => {
        const res = await get('/api/billing/periods', sessionCookie);
        await assertOk(res, 'billing/periods');
      },
    },
    {
      name: '/api/invoices returns invoice list',
      fn: async () => {
        const res = await get('/api/invoices', sessionCookie);
        await assertOk(res, 'invoices');
      },
    },
    {
      name: '/api/payments returns payment list',
      fn: async () => {
        const res = await get('/api/payments', sessionCookie);
        await assertOk(res, 'payments');
      },
    },
    {
      name: '/api/analytics/summary returns summary data',
      fn: async () => {
        const res = await get('/api/analytics/summary', sessionCookie);
        await assertOk(res, 'analytics/summary');
      },
    },
    {
      name: '/api/admin/jobs returns job list',
      fn: async () => {
        const res = await get('/api/admin/jobs', sessionCookie);
        await assertOk(res, 'admin/jobs');
      },
    },
    {
      name: '/api/admin/system-health/alerts returns health data',
      fn: async () => {
        const res = await get('/api/admin/system-health/alerts', sessionCookie);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      },
    },
    {
      name: 'Logout clears session',
      fn: async () => {
        const res = await fetch(`${BASE}/api/auth/logout`, {
          method: 'POST',
          headers: { Cookie: sessionCookie },
        });
        if (!res.ok) throw new Error(`Logout HTTP ${res.status}`);
      },
    },
  ];

  let passed = 0;
  let failed = 0;

  console.log(`\nSmoke test → ${BASE}\n`);

  for (const check of checks) {
    try {
      await check.fn();
      console.log(`  ✓  ${check.name}`);
      passed++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ✗  ${check.name}\n     ${msg}`);
      failed++;
    }
  }

  console.log(`\n${passed + failed} checks — ${passed} passed, ${failed} failed\n`);

  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error('Smoke test runner error:', err);
  process.exit(1);
});
