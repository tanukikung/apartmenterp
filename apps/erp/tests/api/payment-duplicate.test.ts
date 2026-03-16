import { describe, it, expect, beforeEach, vi } from 'vitest';
import http from 'http';
import supertest from 'supertest';
import { prisma } from '@/lib/db/client';

describe('Payment duplicate protection', () => {
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
      async function handle(mod: any, init: { json?: any; cookies?: Record<string, string> }) {
        const reqLike = {
          url: `http://localhost${url}`,
          headers: { get: () => null },
          json: async () => init.json ?? (bodyText ? JSON.parse(bodyText) : {}),
          cookies: {
            get: (k: string) => {
              const v = (init.cookies || {})[k];
              return v ? { name: k, value: v } : undefined;
            },
          },
        } as any;
        const resLike: Response = await (mod as any).POST(reqLike);
        const outText = await resLike.text();
        res.statusCode = resLike.status;
        resLike.headers.forEach((v, k) => res.setHeader(k, v));
        res.end(outText);
      }
      if (url === '/api/payments' && method === 'POST') {
        const mod = await import('@/app/api/payments/route');
        await handle(mod, { json: bodyText ? JSON.parse(bodyText) : {}, cookies: { role: 'ADMIN' } });
        return;
      }
      res.statusCode = 404;
      res.end('Not Found');
    });
    request = supertest(server);
  });

  it('rejects duplicate payment reference with 409', async () => {
    const inv = { id: '11111111-1111-1111-1111-111111111111', total: 1000, room: {} };
    const payments: any[] = [];
    vi.spyOn(prisma.invoice, 'findUnique').mockResolvedValue(inv as any);
    vi.spyOn(prisma.invoice, 'update').mockResolvedValue({ ...inv, status: 'PAID', paidAt: new Date() } as any);
    const findFirst = vi.spyOn(prisma.payment, 'findFirst').mockResolvedValueOnce(null as any).mockResolvedValueOnce({ id: 'dup' } as any);
    const tx: any = {
      payment: {
        create: vi.fn(async ({ data }: any) => {
          payments.push({ id: data.id, reference: data.reference });
          return { id: data.id };
        }),
      },
      invoice: {
        update: vi.fn(async () => ({})),
      },
      outboxEvent: {
        create: vi.fn(async () => ({})),
      },
    };
    vi.spyOn(prisma, '$transaction').mockImplementation(async (fn: any) => fn(tx));

    const payload = { invoiceId: inv.id, amount: 1000, method: 'CASH', referenceNumber: 'REF-1' };
    const r1 = await request.post('/api/payments').send(payload).set('Content-Type', 'application/json');
    const r2 = await request.post('/api/payments').send(payload).set('Content-Type', 'application/json');
    expect(r1.status).toBe(201);
    expect(r2.status).toBe(409);
    expect(payments.length).toBe(1);
    expect(findFirst).toHaveBeenCalledTimes(2);
  });
});
