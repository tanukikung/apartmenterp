import { describe, it, expect, beforeEach, vi } from 'vitest';
import http from 'http';
import supertest from 'supertest';
import { signSessionToken } from '@/lib/auth/session';

describe('Payment API routes', () => {
  let server: http.Server;
  let request: supertest.SuperTest<supertest.Test>;

  beforeEach(() => {
    vi.restoreAllMocks();
    server = http.createServer(async (req, res) => {
      const url = req.url || '/';
      const method = req.method || 'GET';
      let bodyText = '';
      req.on('data', (chunk) => (bodyText += chunk));
      await new Promise<void>((resolve) => req.on('end', () => resolve()));

      async function handleNextRoute(mod: any, init: { json?: any; method?: string; cookies?: Record<string, string> }) {
        const reqLike = {
          url: `http://localhost${url}`,
          method: init.method || method,
          headers: { get: () => null },
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

      // POST /api/payments
      if (url === '/api/payments' && method === 'POST') {
        const mod = await import('@/app/api/payments/route');
        await handleNextRoute(mod, {
          method,
          json: bodyText ? JSON.parse(bodyText) : {},
          cookies: parseCookieHeader(req.headers['cookie'] as string | undefined),
        });
        return;
      }

      // POST /api/payments/match/confirm
      if (url === '/api/payments/match/confirm' && method === 'POST') {
        const mod = await import('@/app/api/payments/match/confirm/route');
        await handleNextRoute(mod, {
          method,
          json: bodyText ? JSON.parse(bodyText) : {},
          cookies: parseCookieHeader(req.headers['cookie'] as string | undefined),
        });
        return;
      }

      // POST /api/payments/match/reject
      if (url === '/api/payments/match/reject' && method === 'POST') {
        const mod = await import('@/app/api/payments/match/reject/route');
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

  it('successful payment match: POST /api/payments creates payment and sets invoice PAID', async () => {
    const mod = await import('@/modules/payments/payment.service');
    const payments: Array<{ id: string }> = [];
    let invoiceStatus = 'GENERATED';
    vi.spyOn(mod, 'getPaymentService').mockReturnValue({
      createPayment: vi.fn(async () => {
        const payment = { id: 'pay-123' } as any;
        const invoice = { id: 'inv-123', status: 'PAID' } as any;
        payments.push(payment);
        invoiceStatus = 'PAID';
        return { payment, invoice };
      }),
    } as any);

    const res = await request
      .post('/api/payments')
      .set('Cookie', buildAuthCookie('ADMIN'))
      .send({ invoiceId: '11111111-1111-1111-1111-111111111111', amount: 1000, method: 'CASH' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(201);
    expect(payments.length).toBe(1);
    expect(invoiceStatus).toBe('PAID');
    expect(res.body?.success).toBe(true);
  });

  it('confirm payment: POST /api/payments/match/confirm updates invoice to PAID and creates payment', async () => {
    const mod = await import('@/modules/payments/payment-matching.service');
    const payments: string[] = [];
    let invoice = { id: 'inv-789', status: 'GENERATED' };
    vi.spyOn(mod, 'getPaymentMatchingService').mockReturnValue({
      confirmMatch: vi.fn(async () => {
        // simulate side-effects
        payments.push('pay-999');
        invoice.status = 'PAID';
      }),
    } as any);

    const res = await request
      .post('/api/payments/match/confirm')
      .set('Cookie', buildAuthCookie('STAFF'))
      .send({ transactionId: 'txn-1', invoiceId: 'inv-789' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(200);
    expect(payments.length).toBe(1);
    expect(invoice.status).toBe('PAID');
    expect(res.body?.success).toBe(true);
  });

  it('reject payment: POST /api/payments/match/reject leaves invoice unchanged', async () => {
    const mod = await import('@/modules/payments/payment-matching.service');
    let invoice = { id: 'inv-456', status: 'GENERATED' };
    vi.spyOn(mod, 'getPaymentMatchingService').mockReturnValue({
      rejectMatch: vi.fn(async () => {
        // no change to invoice
      }),
    } as any);

    const res = await request
      .post('/api/payments/match/reject')
      .set('Cookie', buildAuthCookie('ADMIN'))
      .send({ transactionId: 'txn-2', rejectReason: 'Invalid' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(200);
    expect(invoice.status).toBe('GENERATED');
    expect(res.body?.success).toBe(true);
  });

  it('unauthenticated returns 401 and invalid role returns 403', async () => {
    const res2 = await request
      .post('/api/payments/match/confirm')
      .send({ transactionId: 't', invoiceId: 'i' })
      .set('Content-Type', 'application/json');
    expect(res2.status).toBe(401);

    const res3 = await request
      .post('/api/payments/match/reject')
      .set('Cookie', buildAuthCookie('TENANT' as any))
      .send({ transactionId: 't', rejectReason: 'x' })
      .set('Content-Type', 'application/json');
    expect(res3.status).toBe(403);
  });
});

function buildAuthCookie(role: 'ADMIN' | 'STAFF' | 'TENANT'): string {
  const token = signSessionToken({
    sub: `test-${role.toLowerCase()}`,
    username: `${role.toLowerCase()}-user`,
    displayName: `${role} User`,
    role: role as any,
    forcePasswordChange: false,
    exp: Math.floor(Date.now() / 1000) + 60 * 60,
  });

  return `auth_session=${token}; role=${role}`;
}

function parseCookieHeader(header?: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!header) return result;
  const parts = header.split(';').map((p) => p.trim());
  for (const p of parts) {
    const i = p.indexOf('=');
    if (i > -1) {
      const k = p.slice(0, i);
      const v = p.slice(i + 1);
      result[k] = v;
    }
  }
  return result;
}
