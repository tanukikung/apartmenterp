import { describe, it, expect } from 'vitest';
import {
  createMoveOutSchema,
  updateMoveOutSchema,
  createMoveOutItemSchema,
  updateMoveOutItemSchema,
  calculateDepositSchema,
  confirmMoveOutSchema,
  markRefundSchema,
  listMoveOutsQuerySchema,
  sendMoveOutNoticeSchema,
  moveOutStatusSchema,
  moveOutItemConditionSchema,
} from '@/modules/moveouts/types';

describe('move-out schema validation', () => {
  describe('createMoveOutSchema', () => {
    it('parses valid move-out creation', () => {
      const parsed = createMoveOutSchema.safeParse({
        contractId: '11111111-1111-1111-1111-111111111111',
        moveOutDate: '2025-06-30',
        notes: 'Tenant moving out',
      });
      expect(parsed.success).toBe(true);
    });

    it('parses without notes', () => {
      const parsed = createMoveOutSchema.safeParse({
        contractId: '11111111-1111-1111-1111-111111111111',
        moveOutDate: '2025-06-30',
      });
      expect(parsed.success).toBe(true);
    });

    it('rejects invalid contract ID', () => {
      const parsed = createMoveOutSchema.safeParse({
        contractId: 'not-a-uuid',
        moveOutDate: '2025-06-30',
      });
      expect(parsed.success).toBe(false);
    });

    it('rejects invalid date', () => {
      const parsed = createMoveOutSchema.safeParse({
        contractId: '11111111-1111-1111-1111-111111111111',
        moveOutDate: 'not-a-date',
      });
      expect(parsed.success).toBe(false);
    });
  });

  describe('moveOutStatusSchema', () => {
    it('accepts valid statuses', () => {
      const statuses = ['PENDING', 'INSPECTION_DONE', 'DEPOSIT_CALCULATED', 'CONFIRMED', 'REFUNDED', 'CANCELLED'];
      statuses.forEach((status) => {
        const parsed = moveOutStatusSchema.safeParse(status);
        expect(parsed.success).toBe(true);
      });
    });

    it('rejects invalid status', () => {
      const parsed = moveOutStatusSchema.safeParse('INVALID');
      expect(parsed.success).toBe(false);
    });
  });

  describe('moveOutItemConditionSchema', () => {
    it('accepts valid conditions', () => {
      const conditions = ['GOOD', 'FAIR', 'DAMAGED', 'MISSING'];
      conditions.forEach((condition) => {
        const parsed = moveOutItemConditionSchema.safeParse(condition);
        expect(parsed.success).toBe(true);
      });
    });

    it('rejects invalid condition', () => {
      const parsed = moveOutItemConditionSchema.safeParse('PERFECT');
      expect(parsed.success).toBe(false);
    });
  });

  describe('createMoveOutItemSchema', () => {
    it('parses valid item', () => {
      const parsed = createMoveOutItemSchema.safeParse({
        category: 'wall',
        item: 'Paint',
        condition: 'FAIR',
        cost: 500,
        notes: 'Minor scratches',
      });
      expect(parsed.success).toBe(true);
    });

    it('rejects empty category', () => {
      const parsed = createMoveOutItemSchema.safeParse({
        category: '',
        item: 'Paint',
        condition: 'GOOD',
        cost: 0,
      });
      expect(parsed.success).toBe(false);
    });

    it('rejects negative cost', () => {
      const parsed = createMoveOutItemSchema.safeParse({
        category: 'wall',
        item: 'Paint',
        condition: 'GOOD',
        cost: -100,
      });
      expect(parsed.success).toBe(false);
    });
  });

  describe('calculateDepositSchema', () => {
    it('parses valid deduction inputs', () => {
      const parsed = calculateDepositSchema.safeParse({
        cleaningFee: 500,
        damageRepairCost: 1500,
        otherDeductions: 200,
      });
      expect(parsed.success).toBe(true);
    });

    it('accepts all zeros', () => {
      const parsed = calculateDepositSchema.safeParse({
        cleaningFee: 0,
        damageRepairCost: 0,
        otherDeductions: 0,
      });
      expect(parsed.success).toBe(true);
    });

    it('rejects negative values', () => {
      const parsed = calculateDepositSchema.safeParse({
        cleaningFee: -100,
        damageRepairCost: 0,
        otherDeductions: 0,
      });
      expect(parsed.success).toBe(false);
    });
  });

  describe('listMoveOutsQuerySchema', () => {
    it('parses empty query with defaults', () => {
      const parsed = listMoveOutsQuerySchema.safeParse({});
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.page).toBe(1);
        expect(parsed.data.pageSize).toBe(20);
        expect(parsed.data.sortBy).toBe('createdAt');
        expect(parsed.data.sortOrder).toBe('desc');
      }
    });

    it('parses with filters', () => {
      const parsed = listMoveOutsQuerySchema.safeParse({
        roomNo: '101',
        status: 'PENDING',
        page: '2',
        pageSize: '50',
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.roomNo).toBe('101');
        expect(parsed.data.status).toBe('PENDING');
        expect(parsed.data.page).toBe(2);
        expect(parsed.data.pageSize).toBe(50);
      }
    });

    it('rejects invalid page size', () => {
      const parsed = listMoveOutsQuerySchema.safeParse({
        pageSize: '200',
      });
      expect(parsed.success).toBe(false);
    });

    it('rejects invalid sortBy', () => {
      const parsed = listMoveOutsQuerySchema.safeParse({
        sortBy: 'invalid',
      });
      expect(parsed.success).toBe(false);
    });
  });

  describe('sendMoveOutNoticeSchema', () => {
    it('parses with message', () => {
      const parsed = sendMoveOutNoticeSchema.safeParse({
        message: 'Custom move-out notice message',
      });
      expect(parsed.success).toBe(true);
    });

    it('parses without message', () => {
      const parsed = sendMoveOutNoticeSchema.safeParse({});
      expect(parsed.success).toBe(true);
    });

    it('rejects message over 2000 chars', () => {
      const parsed = sendMoveOutNoticeSchema.safeParse({
        message: 'x'.repeat(2001),
      });
      expect(parsed.success).toBe(false);
    });
  });
});
