/**
 * Stabilization tests — Rooms stats panel total fix
 *
 * Verifies that RoomListResponse carries a statusCounts field and that the
 * type contract enforces it. These are compile-time / type-shape tests that
 * don't need a live DB.
 *
 * Updated for new schema: RoomStatus is VACANT | OCCUPIED | MAINTENANCE | OWNER_USE.
 */
import { describe, it, expect } from 'vitest';
import type { RoomListResponse, RoomStatusCounts } from '@/modules/rooms/types';

describe('RoomListResponse.statusCounts contract', () => {
  it('RoomStatusCounts has VACANT, OCCUPIED, MAINTENANCE, OWNER_USE keys', () => {
    // Construct a valid value and assert the keys exist
    const counts: RoomStatusCounts = { VACANT: 15, OCCUPIED: 10, MAINTENANCE: 2, OWNER_USE: 0 };
    expect(counts.VACANT).toBe(15);
    expect(counts.OCCUPIED).toBe(10);
    expect(counts.MAINTENANCE).toBe(2);
    expect(counts.OWNER_USE).toBe(0);
  });

  it('RoomListResponse includes statusCounts field', () => {
    // Build a minimal conforming object to confirm the type shape at runtime
    const response: RoomListResponse = {
      data: [],
      total: 27,
      page: 1,
      pageSize: 20,
      totalPages: 2,
      statusCounts: { VACANT: 15, OCCUPIED: 10, MAINTENANCE: 2, OWNER_USE: 0 },
    };
    expect(response.statusCounts.VACANT + response.statusCounts.OCCUPIED + response.statusCounts.MAINTENANCE + response.statusCounts.OWNER_USE).toBe(27);
  });

  it('stats.total should come from response.total (not data.length)', () => {
    // Simulate what the UI useMemo should do after the fix
    const data: RoomListResponse = {
      data: new Array(100).fill({ roomNo: '101', roomStatus: 'OCCUPIED' }),
      total: 239, // full DB count
      page: 1,
      pageSize: 100,
      totalPages: 3,
      statusCounts: { VACANT: 120, OCCUPIED: 110, MAINTENANCE: 7, OWNER_USE: 2 },
    };

    // NEW (fixed) stats derivation
    const stats = {
      total: data.total,
      vacant: data.statusCounts.VACANT,
      occupied: data.statusCounts.OCCUPIED,
      maintenance: data.statusCounts.MAINTENANCE,
      ownerUse: data.statusCounts.OWNER_USE,
    };

    // OLD (buggy) derivation would return data.data.length = 100
    const oldTotal = data.data.length; // 100

    expect(stats.total).toBe(239);
    expect(stats.total).not.toBe(oldTotal);
    expect(stats.vacant + stats.occupied + stats.maintenance + stats.ownerUse).toBe(239);
  });
});

