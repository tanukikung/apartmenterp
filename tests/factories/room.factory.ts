import type { Prisma } from '@prisma/client';

// Building and Floor models have been removed in the new schema.
// createBuilding and createFloor are kept as stubs for backward compatibility
// with tests that imported them; they do nothing and return a minimal object.

export async function createBuilding(
  overrides: Partial<{ name: string; address: string; totalFloors: number }> = {},
  _tx?: Prisma.TransactionClient
): Promise<{ id: string; name: string; address: string }> {
  // Building model removed — return a stub so callers don't break at import time.
  return { id: 'stub-building', name: overrides.name ?? 'Stub Building', address: overrides.address ?? 'Stub Address' };
}

export async function createFloor(
  _buildingId: string,
  overrides: Partial<{ floorNumber: number }> = {},
  _tx?: Prisma.TransactionClient
): Promise<{ id: string; floorNumber: number }> {
  // Floor model removed — return a stub.
  return { id: `stub-floor-${overrides.floorNumber ?? 1}`, floorNumber: overrides.floorNumber ?? 1 };
}

export async function createRoom(
  _floorId: string,
  overrides: Partial<{ roomNumber: string; roomNo: string; floorNo: number; status: string; maxResidents: number }> = {},
  tx?: Prisma.TransactionClient
) {
  const { prisma: shared } = await import('@/lib/db/client');
  const db = (tx || shared) as unknown as Prisma.TransactionClient & typeof shared;

  const roomNo = overrides.roomNo ?? overrides.roomNumber ?? `R${Date.now()}-${Math.floor(Math.random() * 90000) + 1000}`;
  const floorNo = overrides.floorNo ?? 1;

  return db.room.create({
    data: {
      roomNo,
      floorNo,
      defaultAccountId: 'ACC_F1',
      defaultRuleCode: 'STANDARD',
      defaultRentAmount: 5000,
      hasFurniture: false,
      defaultFurnitureAmount: 0,
      roomStatus: 'VACANT',
    } as any,
  });
}
