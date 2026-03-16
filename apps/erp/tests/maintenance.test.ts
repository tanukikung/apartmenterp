import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '@/lib';
import { prisma as dbPrisma } from '@/lib/db/client';

vi.mock('@/lib', async () => {
  const actual = await vi.importActual<any>('@/lib');
  const ticket = { id: 't-1', roomId: 'r-1', tenantId: 'u-1', title: 'Leak', description: 'Water leak', priority: 'HIGH', status: 'OPEN', createdAt: new Date(), updatedAt: new Date() };
  const tx = {
    maintenanceTicket: { create: vi.fn().mockResolvedValue(ticket) },
    maintenanceAttachment: { create: vi.fn().mockResolvedValue({ id: 'a-1' }) },
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
    const req: any = { json: async () => body };
    const res: Response = await (mod as any).POST(req);
    expect(res.ok).toBe(true);
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(dbPrisma.auditLog.create).toHaveBeenCalled();
  });

  it('updates maintenance status and writes audit logs', async () => {
    const mod = await import('@/app/api/admin/maintenance/update-status/route');
    const reqBody = { ticketId: '33333333-3333-3333-3333-333333333333', status: 'CLOSED', actorId: 'admin' };
    const req: any = { json: async () => reqBody };
    const res: Response = await (mod as any).POST(req);
    expect(res.ok).toBe(true);
    expect(prisma.maintenanceTicket.update).toHaveBeenCalled();
    // Status updated + closed entries
    expect((dbPrisma.auditLog.create as any).mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
