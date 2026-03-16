import { describe, it, expect } from 'vitest';
import { createRoomSchema } from '@/modules/rooms/types';

describe('room capacity validation', () => {
  it('accepts valid capacity', () => {
    const parsed = createRoomSchema.safeParse({
      floorId: '11111111-1111-1111-1111-111111111111',
      roomNumber: '101',
      capacity: 2,
      status: 'VACANT',
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects capacity below 1', () => {
    const parsed = createRoomSchema.safeParse({
      floorId: '11111111-1111-1111-1111-111111111111',
      roomNumber: '101',
      capacity: 0,
      status: 'VACANT',
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects capacity above 10', () => {
    const parsed = createRoomSchema.safeParse({
      floorId: '11111111-1111-1111-1111-111111111111',
      roomNumber: '101',
      capacity: 11,
      status: 'VACANT',
    });
    expect(parsed.success).toBe(false);
  });
});
