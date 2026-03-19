import { describe, it, expect, vi } from 'vitest';
import { getEventBus, EventTypes, prisma, sendLineMessage } from '@/lib';

vi.mock('@/lib', async () => {
  const actual = await vi.importActual<any>('@/lib');
  return {
    ...actual,
    sendLineMessage: vi.fn(),
    prisma: {
      invoice: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'inv-1',
          roomNo: '101',
          room: {
            roomNo: '101',
            tenants: [
              { tenant: { lineUserId: 'U999' } },
            ],
          },
        }),
      },
    },
  };
});

describe('Payment notification via outbox', () => {
  it('subscribes to INVOICE_PAID and sends LINE confirmation', async () => {
    await import('@/modules/messaging/payment-notifier');
    const bus = getEventBus();
    await bus.publish(
      EventTypes.INVOICE_PAID,
      'Invoice',
      'inv-1',
      { invoiceId: 'inv-1' } as unknown as Record<string, unknown>
    );
    expect(sendLineMessage).toHaveBeenCalledWith('U999', expect.stringContaining('Payment received for Room 101'));
  });
});
