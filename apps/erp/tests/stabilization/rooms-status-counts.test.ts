/**
 * Stabilization tests — Rooms stats panel total fix
 *
 * Verifies that RoomListResponse carries a statusCounts field and that the
 * type contract enforces it. These are compile-time / type-shape tests that
 * don't need a live DB.
 *
 * Updated for new schema: RoomStatus is ACTIVE | INACTIVE (no OCCUPIED/VACANT/MAINTENANCE).
 */
import { describe, it, expect } from 'vitest';
import type { RoomListResponse, RoomStatusCounts } from '@/modules/rooms/types';

describe('RoomListResponse.statusCounts contract', () => {
  it('RoomStatusCounts has ACTIVE and INACTIVE keys', () => {
    // Construct a valid value and assert the keys exist
    const counts: RoomStatusCounts = { ACTIVE: 15, INACTIVE: 2 };
    expect(counts.ACTIVE).toBe(15);
    expect(counts.INACTIVE).toBe(2);
  });

  it('RoomListResponse includes statusCounts field', () => {
    // Build a minimal conforming object to confirm the type shape at runtime
    const response: RoomListResponse = {
      data: [],
      total: 17,
      page: 1,
      pageSize: 20,
      totalPages: 1,
      statusCounts: { ACTIVE: 15, INACTIVE: 2 },
    };
    expect(response.statusCounts.ACTIVE + response.statusCounts.INACTIVE).toBe(17);
  });

  it('stats.total should come from response.total (not data.length)', () => {
    // Simulate what the UI useMemo should do after the fix
    const data: RoomListResponse = {
      data: new Array(100).fill({ roomNo: '101', roomStatus: 'ACTIVE' }),
      total: 239, // full DB count
      page: 1,
      pageSize: 100,
      totalPages: 3,
      statusCounts: { ACTIVE: 230, INACTIVE: 9 },
    };

    // NEW (fixed) stats derivation
    const stats = {
      total: data.total,
      active: data.statusCounts.ACTIVE,
      inactive: data.statusCounts.INACTIVE,
    };

    // OLD (buggy) derivation would return data.data.length = 100
    const oldTotal = data.data.length; // 100

    expect(stats.total).toBe(239);
    expect(stats.total).not.toBe(oldTotal);
    expect(stats.active + stats.inactive).toBe(239);
  });
});
