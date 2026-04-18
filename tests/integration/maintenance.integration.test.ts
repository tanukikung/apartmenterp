import { describe, it, expect, vi } from 'vitest';

vi.doUnmock('@/lib/db/client');
vi.resetModules();

process.env.USE_PRISMA_TEST_DB = 'true';

describe('Integration: Maintenance workflow', () => {
  it('creates ticket, updates status, writes audit log', async () => {
    const [{ prisma }, createMod, updateMod] = await Promise.all([
      import('@/lib/db/client'),
      import('@/app/api/maintenance/create/route'),
      import('@/app/api/admin/maintenance/update-status/route'),
    ]);
    try {
      await prisma.$connect();
    } catch {
      return;
    }

    const roomNo = `TEST-M-${crypto.randomUUID().slice(0, 8)}`;
    const room = await (prisma as any).room.create({
      data: {
        roomNo,
        floorNo: 1,
        defaultAccountId: 'ACC_F1',
        defaultRuleCode: 'STANDARD',
        defaultRentAmount: 5000,
        hasFurniture: false,
        defaultFurnitureAmount: 0,
        roomStatus: 'VACANT',
      },
    });
    const tenant = await prisma.tenant.create({
      data: { id: crypto.randomUUID(), firstName: 'Jane', lastName: 'Doe', phone: '12345' },
    });

    const body = {
      roomId: (room as any).roomNo,
      tenantId: tenant.id,
      title: 'Aircon broken',
      description: 'Not cooling',
      priority: 'HIGH',
      attachments: [{ fileUrl: 'https://example.com/p.jpg', fileType: 'image' }],
    };
    const reqCreate: any = { json: async () => body };
    const resCreate: Response = await (createMod as any).POST(reqCreate);
    expect(resCreate.ok).toBe(true);
    const created = await resCreate.json();
    const ticketId = created.data.id;

    const reqUpdate: any = { json: async () => ({ ticketId, status: 'CLOSED', actorId: 'admin' }) };
    const resUpdate: Response = await (updateMod as any).POST(reqUpdate);
    expect(resUpdate.ok).toBe(true);

    const updated = await prisma.maintenanceTicket.findUnique({ where: { id: ticketId } });
    expect(updated?.status).toBe('CLOSED');

    const logs = await prisma.auditLog.findMany({ where: { entityId: ticketId } });
    expect(logs.length).toBeGreaterThan(0);
  });
});
