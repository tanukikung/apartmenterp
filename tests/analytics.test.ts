import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '@/lib';

vi.mock('@/lib/line/client', () => ({
  getLineClient: vi.fn(),
  getLineConfig: vi.fn(() => ({ channelId: '', channelSecret: '', accessToken: '' })),
  sendLineMessage: vi.fn().mockResolvedValue({}),
  sendLineImageMessage: vi.fn().mockResolvedValue({}),
  sendLineFileMessage: vi.fn().mockResolvedValue({}),
  sendFlexMessage: vi.fn().mockResolvedValue({}),
  sendInvoiceMessage: vi.fn().mockResolvedValue({}),
  sendReminderMessage: vi.fn().mockResolvedValue({}),
  sendOverdueNotice: vi.fn().mockResolvedValue({}),
  sendWelcomeMessage: vi.fn().mockResolvedValue({}),
  sendTemplateMessage: vi.fn().mockResolvedValue({}),
  sendReplyMessage: vi.fn().mockResolvedValue({}),
  sendTextWithQuickReply: vi.fn().mockResolvedValue({}),
  getLineUserProfile: vi.fn().mockResolvedValue({}),
  verifyLineSignature: vi.fn().mockReturnValue(true),
  parseWebhookEvent: vi.fn(),
  isLineConfigured: vi.fn().mockReturnValue(false),
}));

vi.mock('@/lib/line', () => ({
  getLineClient: vi.fn(),
  getLineConfig: vi.fn(() => ({ channelId: '', channelSecret: '', accessToken: '' })),
  sendLineMessage: vi.fn().mockResolvedValue({}),
  sendLineImageMessage: vi.fn().mockResolvedValue({}),
  sendLineFileMessage: vi.fn().mockResolvedValue({}),
  sendFlexMessage: vi.fn().mockResolvedValue({}),
  sendInvoiceMessage: vi.fn().mockResolvedValue({}),
  sendReminderMessage: vi.fn().mockResolvedValue({}),
  sendOverdueNotice: vi.fn().mockResolvedValue({}),
  sendWelcomeMessage: vi.fn().mockResolvedValue({}),
  sendTemplateMessage: vi.fn().mockResolvedValue({}),
  sendReplyMessage: vi.fn().mockResolvedValue({}),
  sendTextWithQuickReply: vi.fn().mockResolvedValue({}),
  getLineUserProfile: vi.fn().mockResolvedValue({}),
  verifyLineSignature: vi.fn().mockReturnValue(true),
  parseWebhookEvent: vi.fn(),
  isLineConfigured: vi.fn().mockReturnValue(false),
}));

vi.useFakeTimers();

vi.mock('@/lib/auth/guards', () => ({
  requireRole: vi.fn().mockReturnValue({ userId: 'admin-1', role: 'ADMIN', forcePasswordChange: false } as any),
  requireAuthSession: vi.fn().mockReturnValue({ userId: 'admin-1', role: 'ADMIN', forcePasswordChange: false } as any),
  requireOperator: vi.fn().mockReturnValue({ userId: 'admin-1', role: 'ADMIN', forcePasswordChange: false } as any),
}));

vi.mock('@/lib', async () => {
  const actual = await vi.importActual<any>('@/lib');
  return {
    ...actual,
    prisma: {
      invoice: {
        aggregate: vi.fn(),
        count: vi.fn(),
        groupBy: vi.fn(),
        findMany: vi.fn(),
      },
      room: {
        count: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
      },
      roomBilling: {
        aggregate: vi.fn(),
        count: vi.fn(),
      },
      billingPeriod: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        findFirst: vi.fn(),
      },
    },
  };
});

describe('Analytics API', () => {
  beforeEach(() => {
    (prisma.invoice.aggregate as any).mockReset();
    (prisma.invoice.count as any).mockReset();
    (prisma.invoice.groupBy as any).mockReset();
    (prisma.invoice.findMany as any).mockReset();
    (prisma.room.count as any).mockReset();
    (prisma.roomBilling.aggregate as any).mockReset();
    (prisma.roomBilling.count as any).mockReset();
    (prisma.billingPeriod.findUnique as any).mockReset();
    (prisma.billingPeriod.findMany as any).mockReset();
    (prisma.billingPeriod.findFirst as any).mockReset();
  });

  it('summary aggregates monthly revenue and invoice counts', async () => {
    const now = new Date('2026-03-15T12:00:00Z');
    vi.setSystemTime(now);
    (prisma.invoice.aggregate as any).mockResolvedValue({ _sum: { totalAmount: 1234.56 } });
    (prisma.invoice.count as any)
      .mockResolvedValueOnce(5)  // unpaid
      .mockResolvedValueOnce(10) // paid
      .mockResolvedValueOnce(2); // overdue
    const mod = await import('@/app/api/analytics/summary/route');
    const res: Response = await (mod as any).GET({} as any);
    expect(res.ok).toBe(true);
    const body = await res.json();
    expect(body.data.monthlyRevenue).toBe(1234.56);
    expect(body.data.unpaidInvoices).toBe(5);
    expect(body.data.paidInvoices).toBe(10);
    expect(body.data.overdueInvoices).toBe(2);
  });

  it('revenue returns 12 months grouped by year/month', async () => {
    const now = new Date('2026-03-01T00:00:00Z');
    vi.setSystemTime(now);
    // The revenue route uses invoice.findMany (not groupBy) to get paid invoices
    (prisma.invoice.findMany as any).mockResolvedValue([
      { paidAt: new Date('2026-03-15T00:00:00Z'), totalAmount: 200 },
      { paidAt: new Date('2026-02-15T00:00:00Z'), totalAmount: 100 },
    ]);
    const mod = await import('@/app/api/analytics/revenue/route');
    const res: Response = await (mod as any).GET({} as any);
    expect(res.ok).toBe(true);
    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data).toHaveLength(12);
    const march = body.data.find((p: any) => p.year === 2026 && p.month === 3);
    const feb = body.data.find((p: any) => p.year === 2026 && p.month === 2);
    expect(march.total).toBe(200);
    expect(feb.total).toBe(100);
  });

  it('occupancy counts rooms by status', async () => {
    (prisma.room.count as any)
      .mockResolvedValueOnce(30) // total
      .mockResolvedValueOnce(20) // occupied
      .mockResolvedValueOnce(10) // vacant
      .mockResolvedValueOnce(0)  // maintenance
      .mockResolvedValueOnce(0); // ownerUse
    const mod = await import('@/app/api/analytics/occupancy/route');
    const res: Response = await (mod as any).GET({} as any);
    expect(res.ok).toBe(true);
    const body = await res.json();
    expect(body.data.totalRooms).toBe(30);
    expect(body.data.occupiedRooms).toBe(20);
    expect(body.data.vacantRooms).toBe(10);
  });
});

