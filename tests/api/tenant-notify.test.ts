import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@/lib';
import { makeRequestLike } from '../helpers/auth';

describe('POST /api/tenants/[id]/notify', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.tenant.findUnique as any).mockResolvedValue(null);
    (prisma.conversation.findFirst as any).mockResolvedValue(null);
    (prisma.messageTemplate.findFirst as any).mockResolvedValue(null);
  });

  it('enqueues an overdue reminder for the latest active conversation', async () => {
    (prisma.tenant.findUnique as any).mockResolvedValue({
      id: 'tenant-1',
      lineUserId: 'U123',
      roomTenants: [{ room: { id: 'room-1', roomNumber: '101' } }],
    });
    (prisma.conversation.findFirst as any).mockResolvedValue({
      id: 'conv-1',
    });
    (prisma.messageTemplate.findFirst as any).mockResolvedValue({
      id: 'tmpl-1',
      body: 'Please settle your overdue balance.',
    });

    const writeOne = vi.fn(async () => undefined);
    const logAudit = vi.fn(async () => undefined);
    const outboxModule = await import('@/lib/outbox');
    const auditModule = await import('@/modules/audit');

    vi.spyOn(outboxModule, 'getOutboxProcessor').mockReturnValue({ writeOne } as any);
    vi.spyOn(auditModule, 'logAudit').mockImplementation(logAudit);

    const { POST } = await import('@/app/api/tenants/[id]/notify/route');

    const res = await POST(
      makeRequestLike({
        url: 'http://localhost/api/tenants/tenant-1/notify',
        method: 'POST',
        role: 'ADMIN',
        headers: { 'Content-Type': 'application/json' },
        body: { type: 'overdue_reminder' },
      }) as any,
      { params: { id: 'tenant-1' } } as any,
    );

    expect(res.status).toBe(202);

    const json = await res.json();
    expect(json).toEqual({
      success: true,
      data: {
        enqueued: true,
        conversationId: 'conv-1',
      },
    });
    expect(writeOne).toHaveBeenCalledWith(
      'Conversation',
      'conv-1',
      'ManualReminderSendRequested',
      expect.objectContaining({
        conversationId: 'conv-1',
        text: 'Please settle your overdue balance.',
        templateId: 'tmpl-1',
        reminderType: 'overdue_reminder',
      }),
    );
    expect(logAudit).toHaveBeenCalled();
  });
});
