import type { Prisma } from '@prisma/client';

export async function createBuilding(
  overrides: Partial<{ name: string; address: string; totalFloors: number }> = {},
  tx?: Prisma.TransactionClient
) {
  const { prisma: shared } = await import('@/lib/db/client');
  const db = (tx || shared) as unknown as Prisma.TransactionClient & typeof shared;
  return db.building.create({
    data: {
      name: overrides.name ?? `Building ${Math.floor(Math.random() * 1000)}`,
      address: overrides.address ?? 'Test Address',
      totalFloors: overrides.totalFloors ?? 3,
    } as any,
  });
}

export async function createFloor(
  buildingId: string,
  overrides: Partial<{ floorNumber: number }> = {},
  tx?: Prisma.TransactionClient
) {
  const { prisma: shared } = await import('@/lib/db/client');
  const db = (tx || shared) as unknown as Prisma.TransactionClient & typeof shared;
  return db.floor.create({
    data: {
      buildingId,
      floorNumber: overrides.floorNumber ?? 1,
    } as any,
  });
}

export async function createRoom(
  floorId: string,
  overrides: Partial<{ roomNumber: string; status: string; maxResidents: number }> = {},
  tx?: Prisma.TransactionClient
) {
  const { prisma: shared } = await import('@/lib/db/client');
  const db = (tx || shared) as unknown as Prisma.TransactionClient & typeof shared;
  return db.room.create({
    data: {
      floorId,
      roomNumber: overrides.roomNumber ?? `${Math.floor(Math.random() * 900) + 100}`,
      status: overrides.status ?? 'OCCUPIED',
      maxResidents: overrides.maxResidents ?? 2,
    } as any,
  });
}
