import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import http from 'http';
import supertest from 'supertest';
import { hashPassword } from '@/lib/auth/password';
import { buildSignedAuthCookie, parseCookieHeader } from '../helpers/auth';
import { getServiceContainer } from '@/lib/service-container';

describe('API routes (supertest)', () => {
  let server: http.Server;
  let request: supertest.SuperTest<supertest.Test>;

  beforeEach(() => {
    server = http.createServer(async (req, res) => {
      const url = req.url || '/';
      const method = req.method || 'GET';
      let bodyText = '';
      req.on('data', (chunk) => (bodyText += chunk));
      await new Promise<void>((resolve) => req.on('end', () => resolve()));

      async function handleNextRoute(mod: any, init: { json?: any; method?: string; headers?: Record<string, string>; cookies?: Record<string, string> }) {
        const headers = new Map<string, string>();
        for (const [k, v] of Object.entries(init.headers || {})) headers.set(k.toLowerCase(), v);
        const reqLike = {
          url: `http://localhost${url}`,
          method: init.method || method,
          headers: { get: (k: string) => headers.get(k.toLowerCase()) || null },
          json: async () => init.json ?? (bodyText ? JSON.parse(bodyText) : {}),
          text: async () => bodyText,
          cookies: {
            get: (k: string) => {
              const v = (init.cookies || {})[k];
              return v ? { name: k, value: v } : undefined;
            },
          },
        } as any;
        const resLike: Response = await (mod as any).POST(reqLike, { params: (req as any).params || {} });
        const outText = await resLike.text();
        res.statusCode = resLike.status;
        resLike.headers.forEach((v, k) => res.setHeader(k, v));
        res.end(outText);
      }

      if (url.startsWith('/api/auth/login') && method === 'POST') {
        const mod = await import('@/app/api/auth/login/route');
        await handleNextRoute(mod, { method, json: bodyText ? JSON.parse(bodyText) : {} });
        return;
      }

      const lockMatch = url.match(/^\/api\/billing\/([^/]+)\/lock$/);
      if (lockMatch && method === 'POST') {
        const id = lockMatch[1];
        (req as any).params = { id };
        const mod = await import('@/app/api/billing/[id]/lock/route');
        await handleNextRoute(mod, {
          method,
          json: bodyText ? JSON.parse(bodyText) : {},
          cookies: parseCookieHeader(req.headers['cookie'] as string | undefined),
        });
        return;
      }

      res.statusCode = 404;
      res.end('Not Found');
    });
    request = supertest(server);
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('auth login sets role cookie', async () => {
    vi.doMock('@/lib/db/client', () => ({
      prisma: {
        adminUser: {
          findFirst: vi.fn(async () => ({
            id: 'admin-1',
            username: 'admin',
            email: 'admin@example.com',
            displayName: 'Admin User',
            role: 'ADMIN',
            passwordHash: hashPassword('secret123'),
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          })),
        },
      },
    }));

    const res = await request
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'secret123' })
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(200);
    const setCookie = res.headers['set-cookie']?.join(';') || '';
    expect(setCookie).toMatch(/role=ADMIN/);
    vi.doUnmock('@/lib/db/client');
  });

  it('billing lock requires admin role', async () => {
    vi.spyOn(getServiceContainer().billingService, 'lockBillingRecord').mockImplementation(async () => ({
      id: 'bill-1',
      roomId: 'room-1',
      roomNo: '101',
      billingPeriodId: 'bp-1',
      year: 2026,
      month: 3,
      status: 'LOCKED' as const,
      subtotal: 1000,
      totalAmount: 1000,
      lockedAt: new Date(),
      lockedBy: 'admin',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any));

    const anonymous = await request
      .post('/api/billing/bill-1/lock')
      .send({ force: false })
      .set('Content-Type', 'application/json');
    expect(anonymous.status).toBe(401);

    const forged = await request
      .post('/api/billing/bill-1/lock')
      .send({ force: false })
      .set('Content-Type', 'application/json')
      .set('Cookie', 'role=ADMIN');
    expect(forged.status).toBe(401);

    const staff = await request
      .post('/api/billing/bill-1/lock')
      .send({ force: false })
      .set('Content-Type', 'application/json')
      .set('Cookie', buildSignedAuthCookie('STAFF'));
    expect(staff.status).toBe(403);

    const ok = await request
      .post('/api/billing/bill-1/lock')
      .send({ force: false })
      .set('Content-Type', 'application/json')
      .set('Cookie', buildSignedAuthCookie('ADMIN'));
    expect(ok.status).toBe(200);
    expect(ok.body?.success).toBe(true);
    expect(ok.body?.data?.status).toBe('LOCKED');
  });
});
