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

    const building = await prisma.building.create({
      data: { id: crypto.randomUUID(), name: 'Tower M', address: 'Z', totalFloors: 3 },
    });
    const floor = await prisma.floor.create({
      data: { id: crypto.randomUUID(), buildingId: building.id, floorNumber: 1 },
    });
    const room = await prisma.room.create({
      data: { id: crypto.randomUUID(), floorId: floor.id, roomNumber: '103', status: 'VACANT', maxResidents: 2 },
    });
    const tenant = await prisma.tenant.create({
      data: { id: crypto.randomUUID(), firstName: 'Jane', lastName: 'Doe', phone: '12345' },
    });

    const body = {
      roomId: room.id,
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
