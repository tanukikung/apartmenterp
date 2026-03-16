import { describe, it, expect, vi } from 'vitest';
import { prisma } from '@/lib';

vi.mock('@/lib', async () => {
  const actual = await vi.importActual<any>('@/lib');
  const prismaMock = {
    invoice: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    payment: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    outboxEvent: {
      create: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
    $transaction: vi.fn(async (fn: any) => {
      (prismaMock.payment.create as any).mockResolvedValueOnce({ id: 'pay-1' });
      (prismaMock.invoice.update as any).mockResolvedValueOnce({ id: 'inv-1', status: 'PAID' });
      return fn({
        invoice: prismaMock.invoice,
        payment: prismaMock.payment,
        outboxEvent: prismaMock.outboxEvent,
      });
    }),
  };
  return {
    ...actual,
    prisma: prismaMock,
  };
});

describe('Payments API', () => {
  it('creates payment and marks invoice paid, emits outbox event', async () => {
    (prisma.invoice.findUnique as any).mockResolvedValue({
      id: 'inv-1',
      total: 1200,
      status: 'GENERATED',
      roomId: 'room-1',
      room: { roomNumber: '101' },
    });
    const mod = await import('@/app/api/payments/route');
    const reqBody = {
      invoiceId: '11111111-1111-1111-1111-111111111111',
      amount: 1200,
      method: 'PROMPTPAY',
      referenceNumber: 'ABC123',
    };
    const req: any = { json: async () => reqBody };
    const res: Response = await (mod as any).POST(req);
    if (!res.ok) {
      const body = await (res as any).json();
      throw new Error(`Response not ok: ${JSON.stringify(body)}`);
    }
    expect(res.ok).toBe(true);
    expect(prisma.payment.create).toHaveBeenCalled();
    expect(prisma.invoice.update).toHaveBeenCalled();
    expect(prisma.outboxEvent.create).toHaveBeenCalled();
  });
});
