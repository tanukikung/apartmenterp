import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@/lib/db/client';
import { makeRequestLike } from '../helpers/auth';

describe('chat quick action routes', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    const line = await import('@/lib/line');
    vi.mocked(line.isLineConfigured).mockReturnValue(true);
  });

  it('accepts real conversation ids for reminder enqueue', async () => {
    const route = await import('@/app/api/reminders/send/route');
    vi.spyOn(prisma.conversation, 'findUnique').mockResolvedValue({
      id: 'conv-validation-ready',
      lineUserId: 'U123',
    } as any);
    vi.spyOn(prisma.messageTemplate, 'findFirst').mockResolvedValue(null as any);
    const writeOne = vi.fn(async () => undefined);
    vi.spyOn(await import('@/lib/outbox'), 'getOutboxProcessor').mockReturnValue({ writeOne } as any);

    const res = await route.POST(
      makeRequestLike({
        url: 'http://localhost/api/reminders/send',
        method: 'POST',
        role: 'ADMIN',
        body: {
          conversationId: 'conv-validation-ready',
          text: 'Payment reminder',
        },
      }) as any,
    );

    expect(res.status).toBe(202);
    expect(writeOne).toHaveBeenCalledWith(
      'Conversation',
      'conv-validation-ready',
      'ManualReminderSendRequested',
      expect.objectContaining({ conversationId: 'conv-validation-ready' }),
    );
  });

  it('accepts real conversation ids for receipt enqueue', async () => {
    const route = await import('@/app/api/receipts/[id]/send/route');
    vi.spyOn(prisma.conversation, 'findUnique').mockResolvedValue({
      id: 'conv-validation-ready',
      lineUserId: 'U123',
    } as any);
    const writeOne = vi.fn(async () => undefined);
    vi.spyOn(await import('@/lib/outbox'), 'getOutboxProcessor').mockReturnValue({ writeOne } as any);

    const res = await route.POST(
      makeRequestLike({
        url: 'http://localhost/api/receipts/invoice-123/send',
        method: 'POST',
        role: 'ADMIN',
        body: {
          conversationId: 'conv-validation-ready',
          paidDate: '2026-03-17T10:00:00.000Z',
        },
      }) as any,
      { params: { id: 'invoice-123' } } as any,
    );

    expect(res.status).toBe(202);
    expect(writeOne).toHaveBeenCalledWith(
      'Receipt',
      'invoice-123',
      'ReceiptSendRequested',
      expect.objectContaining({ conversationId: 'conv-validation-ready' }),
    );
  });

  it('rejects reminder enqueue when LINE is unavailable', async () => {
    const line = await import('@/lib/line');
    vi.mocked(line.isLineConfigured).mockReturnValue(false);
    const route = await import('@/app/api/reminders/send/route');

    const res = await route.POST(
      makeRequestLike({
        url: 'http://localhost/api/reminders/send',
        method: 'POST',
        role: 'ADMIN',
        body: {
          conversationId: 'conv-validation-ready',
          text: 'Payment reminder',
        },
      }) as any,
    );

    expect(res.status).toBe(503);
  });
});
