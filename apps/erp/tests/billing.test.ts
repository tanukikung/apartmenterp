import { describe, it, expect, vi } from 'vitest';
import { getServiceContainer } from '@/lib/service-container';
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
  getLineUserProfile: vi.fn().mockResolvedValue({}),
  verifyLineSignature: vi.fn().mockReturnValue(true),
  parseWebhookEvent: vi.fn(),
  isLineConfigured: vi.fn().mockReturnValue(false),
}));

// New schema: BillingRecord/BillingItemType/BillingItem removed.
// BillingService now uses RoomBilling (flat rows, no separate item table).
vi.mock('@/lib', async () => {
  const actual = await vi.importActual<any>('@/lib');
  const mockPrisma = {
    room: { findFirst: vi.fn(), findUnique: vi.fn() },
    billingPeriod: { findUnique: vi.fn(), create: vi.fn(), upsert: vi.fn() },
    roomBilling: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    outboxEvent: { create: vi.fn() },
    config: { findMany: vi.fn() },
    $transaction: vi.fn(async (fn: any) => fn(mockPrisma)),
  };
  return { ...actual, prisma: mockPrisma };
});

describe('BillingService', () => {
  it('rejects duplicate billing record for same room/month', async () => {
    const billingService = getServiceContainer().billingService;
    // createBillingRecord uses prisma.room.findUnique
    vi.spyOn(prisma.room as any, 'findUnique').mockResolvedValue({ roomNo: 'room-101', defaultAccountId: 'acc-1', defaultRuleCode: 'RULE', defaultRentAmount: 5000 } as any);
    // billingPeriod.findUnique returns existing period
    vi.spyOn(prisma.billingPeriod as any, 'findUnique').mockResolvedValue({ id: 'period-1', year: 2026, month: 3, dueDay: 25 } as any);
    // roomBilling.findUnique returns existing record → conflict
    vi.spyOn(prisma.roomBilling as any, 'findUnique').mockResolvedValue({ id: 'existing' } as any);

    await expect(
      billingService.createBillingRecord({ roomNo: '101', year: 2026, month: 3 })
    ).rejects.toThrow(/already exists/);
  });

  it('creates billing record atomically', async () => {
    const billingService = getServiceContainer().billingService;
    vi.spyOn(prisma.room as any, 'findUnique').mockResolvedValue({ roomNo: '101', defaultAccountId: 'acc-1', defaultRuleCode: 'RULE', defaultRentAmount: 5000 } as any);
    vi.spyOn(prisma.billingPeriod as any, 'findUnique').mockResolvedValue(null as any);
    vi.spyOn(prisma.billingPeriod as any, 'create').mockResolvedValue({ id: 'period-1', year: 2026, month: 3, dueDay: 25 } as any);
    vi.spyOn(prisma.roomBilling as any, 'findUnique').mockResolvedValue(null as any);
    vi.spyOn(prisma.roomBilling as any, 'create').mockResolvedValue({
      id: 'rb-1',
      roomNo: '101',
      billingPeriodId: 'period-1',
      recvAccountId: 'acc-1',
      ruleCode: 'RULE',
      rentAmount: 5000,
      waterMode: 'NORMAL',
      electricMode: 'NORMAL',
      status: 'DRAFT',
    } as any);
    vi.spyOn(prisma.outboxEvent as any, 'create').mockResolvedValue({ id: 'e-1' } as any);

    const result = await billingService.createBillingRecord({ roomNo: '101', year: 2026, month: 3 });

    expect(prisma.roomBilling.create).toHaveBeenCalledTimes(1);
    expect(prisma.outboxEvent.create).toHaveBeenCalledTimes(1);
    expect(result.roomNo).toBe('101');
  });
});
