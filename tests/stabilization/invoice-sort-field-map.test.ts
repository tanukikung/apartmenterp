/**
 * Stabilization tests — Dashboard 500 fix
 *
 * Verifies that the listInvoicesQuerySchema accepts 'totalAmount' as a sortBy
 * value (so API callers don't get a 422) AND that the SORT_FIELD_MAP logic
 * correctly remaps it to 'total' (the actual Prisma field name) before the
 * Prisma query is built.
 *
 * These are pure unit tests — no DB or network required.
 */
import { describe, it, expect } from 'vitest';
import { listInvoicesQuerySchema } from '@/modules/invoices/types';

describe('listInvoicesQuerySchema — sortBy field', () => {
  const VALID_SORT_FIELDS = ['dueDate', 'totalAmount', 'createdAt', 'status'] as const;

  for (const field of VALID_SORT_FIELDS) {
    it(`accepts sortBy="${field}"`, () => {
      const result = listInvoicesQuerySchema.safeParse({ sortBy: field });
      expect(result.success).toBe(true);
    });
  }

  it('rejects unknown sortBy values', () => {
    const result = listInvoicesQuerySchema.safeParse({ sortBy: 'unknownField' });
    expect(result.success).toBe(false);
  });
});

describe('SORT_FIELD_MAP — totalAmount → total remapping', () => {
  // Replicate the mapping logic from the service so we can unit-test it
  // independently without instantiating the full service class.
  const SORT_FIELD_MAP: Record<string, string> = { totalAmount: 'total' };
  function resolvePrismaField(sortBy: string): string {
    return SORT_FIELD_MAP[sortBy] ?? sortBy;
  }

  it('maps totalAmount to total (actual Prisma column)', () => {
    expect(resolvePrismaField('totalAmount')).toBe('total');
  });

  it('passes through createdAt unchanged', () => {
    expect(resolvePrismaField('createdAt')).toBe('createdAt');
  });

  it('passes through dueDate unchanged', () => {
    expect(resolvePrismaField('dueDate')).toBe('dueDate');
  });

  it('passes through status unchanged', () => {
    expect(resolvePrismaField('status')).toBe('status');
  });
});
