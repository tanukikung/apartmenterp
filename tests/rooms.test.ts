import { describe, it, expect } from 'vitest';
import { createRoomSchema } from '@/modules/rooms/types';

describe('room capacity validation', () => {
  it('accepts valid capacity', () => {
    const parsed = createRoomSchema.safeParse({
      roomNo: '101',
      floorNo: 1,
      defaultAccountId: 'acc-1',
      defaultRuleCode: 'RULE-1',
      defaultRentAmount: 5000,
      roomStatus: 'VACANT',
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects missing roomNo', () => {
    const parsed = createRoomSchema.safeParse({
      floorNo: 1,
      defaultAccountId: 'acc-1',
      defaultRuleCode: 'RULE-1',
      defaultRentAmount: 5000,
      roomStatus: 'VACANT',
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects invalid roomStatus', () => {
    const parsed = createRoomSchema.safeParse({
      roomNo: '101',
      floorNo: 1,
      defaultAccountId: 'acc-1',
      defaultRuleCode: 'RULE-1',
      defaultRentAmount: 5000,
      roomStatus: 'INVALID_STATUS',
    });
    expect(parsed.success).toBe(false);
  });
});
