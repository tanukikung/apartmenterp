import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '@/lib';
import { prisma as dbPrisma } from '@/lib/db/client';
import { makeRequestLike } from './helpers/auth';

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

vi.mock('@/lib', async () => {
  const actual = await vi.importActual<any>('@/lib');
  const ticket = { id: 't-1', roomId: 'r-1', tenantId: 'u-1', title: 'Leak', description: 'Water leak', priority: 'HIGH', status: 'OPEN', createdAt: new Date(), updatedAt: new Date() };
  const tx = {
    maintenanceTicket: { create: vi.fn().mockResolvedValue(ticket) },
    maintenanceAttachment: { create: vi.fn().mockResolvedValue({ id: 'a-1' }) },
    roomTenant: { findFirst: vi.fn().mockResolvedValue({ tenantId: 'u-1', roomNo: 'r-1' }) },
  };
  return {
    ...actual,
    prisma: {
      $transaction: vi.fn(async (fn: any) => fn(tx)),
      maintenanceTicket: {
        findMany: vi.fn().mockResolvedValue([ticket]),
        update: vi.fn().mockResolvedValue({ ...ticket, status: 'CLOSED' }),
      },
      maintenanceAttachment: {
        create: vi.fn(),
      },
      auditLog: {
        create: vi.fn(),
      },
    },
  };
});

vi.mock('@/lib/db/client', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    prisma: {
      ...actual.prisma,
      auditLog: {
        create: vi.fn(),
      },
    },
  };
});
describe('Maintenance API and audit logging', () => {
  beforeEach(() => {
    (prisma.$transaction as any).mockClear?.();
    (prisma.maintenanceTicket.findMany as any).mockClear?.();
    (prisma.maintenanceTicket.update as any).mockClear?.();
    (prisma.auditLog.create as any).mockClear?.();
  });

  it('creates maintenance ticket and writes audit log', async () => {
    const mod = await import('@/app/api/maintenance/create/route');
    const body = {
      roomId: '11111111-1111-1111-1111-111111111111',
      tenantId: '22222222-2222-2222-2222-222222222222',
      title: 'Aircon broken',
      description: 'Not cooling',
      priority: 'HIGH',
      attachments: [{ fileUrl: 'https://example.com/p.jpg', fileType: 'image' }],
    };
    const req = makeRequestLike({
      url: 'http://localhost/api/maintenance/create',
      method: 'POST',
      role: 'STAFF',
      body,
    });
    const res: Response = await (mod as any).POST(req);
    expect(res.ok).toBe(true);
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(dbPrisma.auditLog.create).toHaveBeenCalled();
    expect(dbPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'test-staff',
          details: expect.objectContaining({
            actorRole: 'STAFF',
            submittedTenantId: body.tenantId,
            tenantId: 'u-1',
          }),
        }),
      }),
    );
  });

  it('updates maintenance status and writes audit logs', async () => {
    const mod = await import('@/app/api/admin/maintenance/update-status/route');
    const reqBody = { ticketId: '33333333-3333-3333-3333-333333333333', status: 'CLOSED' };
    const req = makeRequestLike({
      url: 'http://localhost/api/admin/maintenance/update-status',
      method: 'POST',
      role: 'ADMIN',
      body: reqBody,
    });
    const res: Response = await (mod as any).POST(req);
    expect(res.ok).toBe(true);
    expect(prisma.maintenanceTicket.update).toHaveBeenCalled();
  });
});
