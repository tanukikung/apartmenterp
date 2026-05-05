/**
 * Gap 5: Financial Period Hard Lock — Hardening Tests
 *
 * Tests that verify the period lock guard blocks mutations on finalized periods
 * (CLOSED, LOCKED, ARCHIVED) while still allowing the designed escape hatch
 * (createAdjustment on CLOSED).
 *
 * TC-1: edit billing on CLOSED period → FinancialPeriodClosedError
 * TC-2: edit billing on LOCKED period → FinancialPeriodClosedError
 * TC-3: payment reassign on CLOSED period → blocked
 * TC-4: invoice modify on CLOSED period → blocked
 * TC-5: adjustment creation on CLOSED period → ALLOWED (escape hatch)
 * TC-6: OPEN period → all mutations allowed
 * TC-7: payment reassign across periods → if EITHER is CLOSED → blocked
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.USE_PRISMA_TEST_DB = 'false'; // This test uses mocks, not real DB

// ── Mock dependencies ─────────────────────────────────────────────────────────

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@/modules/audit', () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/modules/financial-audit', () => ({
  logFinancialAudit: vi.fn().mockResolvedValue(undefined),
}));

// ── Import after mocks ────────────────────────────────────────────────────────

import { prisma } from '@/lib/db/client';
import {
  isPeriodFinalized,
  assertPeriodAllowsMutation,
  assertBillingPeriodAllowsBillingEdit,
  assertBillingPeriodAllowsBulkUpdate,
  assertPaymentReassignmentAllowed,
  assertInvoicePeriodAllowsMutation,
  getPeriodIdForInvoice,
} from '@/modules/billing/period-lock.service';
import { FinancialPeriodClosedError, FinancialPeriodArchivedError } from '@/modules/billing/period-closing.service';
import { BILLING_PERIOD_STATUS } from '@/lib/constants';

// ── Helpers ────────────────────────────────────────────────────────────────────

async function getTx() {
  return prisma as unknown as Parameters<typeof assertPeriodAllowsMutation>[0];
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('isPeriodFinalized', () => {
  it('returns true for CLOSED', () => {
    expect(isPeriodFinalized('CLOSED')).toBe(true);
  });

  it('returns true for LOCKED', () => {
    expect(isPeriodFinalized('LOCKED')).toBe(true);
  });

  it('returns true for ARCHIVED', () => {
    expect(isPeriodFinalized('ARCHIVED')).toBe(true);
  });

  it('returns false for OPEN', () => {
    expect(isPeriodFinalized('OPEN')).toBe(false);
  });

  it('returns false for DRAFT', () => {
    expect(isPeriodFinalized('DRAFT')).toBe(false);
  });
});

describe('assertPeriodAllowsMutation — billing_edit operation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('TC-1: throws FinancialPeriodClosedError when period is CLOSED (billing_edit)', async () => {
    prisma.billingPeriod.findUnique = vi.fn().mockResolvedValue({
      id: 'period-2026-3',
      year: 2026,
      month: 3,
      status: BILLING_PERIOD_STATUS.CLOSED,
      dueDay: 25,
    } as never);

    const tx = await getTx();
    await expect(
      assertPeriodAllowsMutation(tx, 'period-2026-3', 'billing_edit'),
    ).rejects.toThrow(FinancialPeriodClosedError);
  });

  it('TC-2: throws FinancialPeriodClosedError when period is LOCKED (billing_edit)', async () => {
    prisma.billingPeriod.findUnique.mockResolvedValue({
      id: 'period-2026-3',
      year: 2026,
      month: 3,
      status: BILLING_PERIOD_STATUS.LOCKED,
      dueDay: 25,
    } as never);

    const tx = await getTx();
    await expect(
      assertPeriodAllowsMutation(tx, 'period-2026-3', 'billing_edit'),
    ).rejects.toThrow(FinancialPeriodClosedError);
  });

  it('throws FinancialPeriodArchivedError when period is ARCHIVED', async () => {
    prisma.billingPeriod.findUnique.mockResolvedValue({
      id: 'period-2026-3',
      year: 2026,
      month: 3,
      status: BILLING_PERIOD_STATUS.ARCHIVED,
      dueDay: 25,
    } as never);

    const tx = await getTx();
    await expect(
      assertPeriodAllowsMutation(tx, 'period-2026-3', 'billing_edit'),
    ).rejects.toThrow(FinancialPeriodArchivedError);
  });

  it('TC-6: allows billing_edit when period is OPEN', async () => {
    prisma.billingPeriod.findUnique.mockResolvedValue({
      id: 'period-2026-3',
      year: 2026,
      month: 3,
      status: BILLING_PERIOD_STATUS.OPEN,
      dueDay: 25,
    } as never);

    const tx = await getTx();
    await expect(
      assertPeriodAllowsMutation(tx, 'period-2026-3', 'billing_edit'),
    ).resolves.toBeUndefined();
  });

  it('allows billing_edit when period is DRAFT', async () => {
    prisma.billingPeriod.findUnique.mockResolvedValue({
      id: 'period-2026-3',
      year: 2026,
      month: 3,
      status: BILLING_PERIOD_STATUS.DRAFT,
      dueDay: 25,
    } as never);

    const tx = await getTx();
    await expect(
      assertPeriodAllowsMutation(tx, 'period-2026-3', 'billing_edit'),
    ).resolves.toBeUndefined();
  });
});

describe('assertPeriodAllowsMutation — billing_bulk_update operation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('blocks billing_bulk_update on CLOSED period', async () => {
    prisma.billingPeriod.findUnique.mockResolvedValue({
      id: 'period-2026-3',
      year: 2026,
      month: 3,
      status: BILLING_PERIOD_STATUS.CLOSED,
      dueDay: 25,
    } as never);

    const tx = await getTx();
    await expect(
      assertPeriodAllowsMutation(tx, 'period-2026-3', 'billing_bulk_update'),
    ).rejects.toThrow(FinancialPeriodClosedError);
  });

  it('blocks billing_bulk_update on LOCKED period', async () => {
    prisma.billingPeriod.findUnique.mockResolvedValue({
      id: 'period-2026-3',
      year: 2026,
      month: 3,
      status: BILLING_PERIOD_STATUS.LOCKED,
      dueDay: 25,
    } as never);

    const tx = await getTx();
    await expect(
      assertPeriodAllowsMutation(tx, 'period-2026-3', 'billing_bulk_update'),
    ).rejects.toThrow(FinancialPeriodClosedError);
  });

  it('allows billing_bulk_update on OPEN period', async () => {
    prisma.billingPeriod.findUnique.mockResolvedValue({
      id: 'period-2026-3',
      year: 2026,
      month: 3,
      status: BILLING_PERIOD_STATUS.OPEN,
      dueDay: 25,
    } as never);

    const tx = await getTx();
    await expect(
      assertPeriodAllowsMutation(tx, 'period-2026-3', 'billing_bulk_update'),
    ).resolves.toBeUndefined();
  });
});

describe('assertPeriodAllowsMutation — payment_reassign operation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('TC-3: blocks payment_reassign on CLOSED period', async () => {
    prisma.billingPeriod.findUnique.mockResolvedValue({
      id: 'period-2026-3',
      year: 2026,
      month: 3,
      status: BILLING_PERIOD_STATUS.CLOSED,
      dueDay: 25,
    } as never);

    const tx = await getTx();
    await expect(
      assertPeriodAllowsMutation(tx, 'period-2026-3', 'payment_reassign'),
    ).rejects.toThrow(FinancialPeriodClosedError);
  });

  it('blocks payment_reassign on LOCKED period', async () => {
    prisma.billingPeriod.findUnique.mockResolvedValue({
      id: 'period-2026-3',
      year: 2026,
      month: 3,
      status: BILLING_PERIOD_STATUS.LOCKED,
      dueDay: 25,
    } as never);

    const tx = await getTx();
    await expect(
      assertPeriodAllowsMutation(tx, 'period-2026-3', 'payment_reassign'),
    ).rejects.toThrow(FinancialPeriodClosedError);
  });

  it('allows payment_reassign on OPEN period', async () => {
    prisma.billingPeriod.findUnique.mockResolvedValue({
      id: 'period-2026-3',
      year: 2026,
      month: 3,
      status: BILLING_PERIOD_STATUS.OPEN,
      dueDay: 25,
    } as never);

    const tx = await getTx();
    await expect(
      assertPeriodAllowsMutation(tx, 'period-2026-3', 'payment_reassign'),
    ).resolves.toBeUndefined();
  });
});

describe('assertPeriodAllowsMutation — invoice_modify_amount operation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('TC-4: blocks invoice_modify_amount on CLOSED period', async () => {
    prisma.billingPeriod.findUnique.mockResolvedValue({
      id: 'period-2026-3',
      year: 2026,
      month: 3,
      status: BILLING_PERIOD_STATUS.CLOSED,
      dueDay: 25,
    } as never);

    const tx = await getTx();
    await expect(
      assertPeriodAllowsMutation(tx, 'period-2026-3', 'invoice_modify_amount'),
    ).rejects.toThrow(FinancialPeriodClosedError);
  });

  it('blocks invoice_modify_amount on LOCKED period', async () => {
    prisma.billingPeriod.findUnique.mockResolvedValue({
      id: 'period-2026-3',
      year: 2026,
      month: 3,
      status: BILLING_PERIOD_STATUS.LOCKED,
      dueDay: 25,
    } as never);

    const tx = await getTx();
    await expect(
      assertPeriodAllowsMutation(tx, 'period-2026-3', 'invoice_modify_amount'),
    ).rejects.toThrow(FinancialPeriodClosedError);
  });

  it('allows invoice_modify_amount on OPEN period', async () => {
    prisma.billingPeriod.findUnique.mockResolvedValue({
      id: 'period-2026-3',
      year: 2026,
      month: 3,
      status: BILLING_PERIOD_STATUS.OPEN,
      dueDay: 25,
    } as never);

    const tx = await getTx();
    await expect(
      assertPeriodAllowsMutation(tx, 'period-2026-3', 'invoice_modify_amount'),
    ).resolves.toBeUndefined();
  });
});

describe('assertPaymentReassignmentAllowed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('TC-7: blocks if new invoice period is CLOSED (old period is OPEN)', async () => {
    prisma.invoice.findUnique.mockImplementation(async ({ where, include }: { where: { id: string }; include?: { roomBilling?: boolean } }) => {
      if (include && 'roomBilling' in include) {
        if (where.id === 'inv-new') {
          return { id: 'inv-new', roomBilling: { billingPeriodId: 'period-2026-3' } } as never;
        }
        if (where.id === 'inv-old') {
          return { id: 'inv-old', roomBilling: { billingPeriodId: 'period-2026-2' } } as never;
        }
      }
      return null;
    });

    prisma.billingPeriod.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => {
      if (where.id === 'period-2026-3') {
        return { id: 'period-2026-3', year: 2026, month: 3, status: BILLING_PERIOD_STATUS.CLOSED, dueDay: 25 } as never;
      }
      if (where.id === 'period-2026-2') {
        return { id: 'period-2026-2', year: 2026, month: 2, status: BILLING_PERIOD_STATUS.OPEN, dueDay: 25 } as never;
      }
      return null;
    });

    const tx = await getTx();
    await expect(
      assertPaymentReassignmentAllowed(tx, 'inv-old', 'inv-new'),
    ).rejects.toThrow(FinancialPeriodClosedError);
  });

  it('TC-7: blocks if EITHER period (old or new) is CLOSED', async () => {
    prisma.invoice.findUnique.mockImplementation(async ({ where, include }: { where: { id: string }; include?: { roomBilling?: boolean } }) => {
      if (include && 'roomBilling' in include) {
        if (where.id === 'inv-new') {
          return { id: 'inv-new', roomBilling: { billingPeriodId: 'period-2026-4' } } as never;
        }
        if (where.id === 'inv-old') {
          return { id: 'inv-old', roomBilling: { billingPeriodId: 'period-2026-3' } } as never;
        }
      }
      return null;
    });

    prisma.billingPeriod.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => {
      return { id: where.id, year: 2026, month: 4, status: BILLING_PERIOD_STATUS.CLOSED, dueDay: 25 } as never;
    });

    const tx = await getTx();
    await expect(
      assertPaymentReassignmentAllowed(tx, 'inv-old', 'inv-new'),
    ).rejects.toThrow(FinancialPeriodClosedError);
  });

  it('allows reassign when both periods are OPEN', async () => {
    prisma.invoice.findUnique.mockImplementation(async ({ where, include }: { where: { id: string }; include?: { roomBilling?: boolean } }) => {
      if (include && 'roomBilling' in include) {
        if (where.id === 'inv-new') {
          return { id: 'inv-new', roomBilling: { billingPeriodId: 'period-2026-4' } } as never;
        }
        if (where.id === 'inv-old') {
          return { id: 'inv-old', roomBilling: { billingPeriodId: 'period-2026-3' } } as never;
        }
      }
      return null;
    });

    prisma.billingPeriod.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => {
      return { id: where.id, year: 2026, month: 4, status: BILLING_PERIOD_STATUS.OPEN, dueDay: 25 } as never;
    });

    const tx = await getTx();
    await expect(
      assertPaymentReassignmentAllowed(tx, 'inv-old', 'inv-new'),
    ).resolves.toBeUndefined();
  });

  it('allows reassign from null invoice (new payment assignment) when period is OPEN', async () => {
    prisma.invoice.findUnique.mockImplementation(async ({ where, include }: { where: { id: string }; include?: { roomBilling?: boolean } }) => {
      if (include && 'roomBilling' in include) {
        if (where.id === 'inv-new') {
          return { id: 'inv-new', roomBilling: { billingPeriodId: 'period-2026-4' } } as never;
        }
      }
      return null;
    });

    prisma.billingPeriod.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => {
      return { id: where.id, year: 2026, month: 4, status: BILLING_PERIOD_STATUS.OPEN, dueDay: 25 } as never;
    });

    const tx = await getTx();
    await expect(
      assertPaymentReassignmentAllowed(tx, null, 'inv-new'),
    ).resolves.toBeUndefined();
  });
});

describe('assertInvoicePeriodAllowsMutation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('blocks invoice_modify_amount when the invoice period is CLOSED', async () => {
    prisma.invoice.findUnique.mockResolvedValue({
      id: 'inv-001',
      roomBilling: { billingPeriodId: 'period-2026-3' },
    } as never);

    prisma.billingPeriod.findUnique.mockResolvedValue({
      id: 'period-2026-3',
      year: 2026,
      month: 3,
      status: BILLING_PERIOD_STATUS.CLOSED,
      dueDay: 25,
    } as never);

    const tx = await getTx();
    await expect(
      assertInvoicePeriodAllowsMutation(tx, 'inv-001', 'invoice_modify_amount'),
    ).rejects.toThrow(FinancialPeriodClosedError);
  });

  it('allows invoice_modify_amount when the invoice period is OPEN', async () => {
    prisma.invoice.findUnique.mockResolvedValue({
      id: 'inv-001',
      roomBilling: { billingPeriodId: 'period-2026-3' },
    } as never);

    prisma.billingPeriod.findUnique.mockResolvedValue({
      id: 'period-2026-3',
      year: 2026,
      month: 3,
      status: BILLING_PERIOD_STATUS.OPEN,
      dueDay: 25,
    } as never);

    const tx = await getTx();
    await expect(
      assertInvoicePeriodAllowsMutation(tx, 'inv-001', 'invoice_modify_amount'),
    ).resolves.toBeUndefined();
  });

  it('does nothing when invoice not found (caller handles 404)', async () => {
    prisma.invoice.findUnique.mockResolvedValue(null);

    const tx = await getTx();
    await expect(
      assertInvoicePeriodAllowsMutation(tx, 'inv-nonexistent', 'invoice_modify_amount'),
    ).resolves.toBeUndefined();
  });
});

describe('getPeriodIdForInvoice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns billingPeriodId from invoice roomBilling relation', async () => {
    prisma.invoice.findUnique.mockResolvedValue({
      id: 'inv-001',
      roomBilling: { billingPeriodId: 'period-2026-3' },
    } as never);

    const tx = await getTx();
    const periodId = await getPeriodIdForInvoice(tx, 'inv-001');
    expect(periodId).toBe('period-2026-3');
  });

  it('returns null when invoice not found', async () => {
    prisma.invoice.findUnique.mockResolvedValue(null);

    const tx = await getTx();
    const periodId = await getPeriodIdForInvoice(tx, 'inv-nonexistent');
    expect(periodId).toBeNull();
  });

  it('returns null when roomBilling is missing', async () => {
    prisma.invoice.findUnique.mockResolvedValue({
      id: 'inv-001',
      roomBilling: null,
    } as unknown as never);

    const tx = await getTx();
    const periodId = await getPeriodIdForInvoice(tx, 'inv-001');
    expect(periodId).toBeNull();
  });
});

describe('assertBillingPeriodAllowsBillingEdit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws FinancialPeriodClosedError on CLOSED period', async () => {
    prisma.billingPeriod.findUnique.mockResolvedValue({
      id: 'period-2026-3',
      year: 2026,
      month: 3,
      status: BILLING_PERIOD_STATUS.CLOSED,
      dueDay: 25,
    } as never);

    const tx = await getTx();
    await expect(
      assertBillingPeriodAllowsBillingEdit(tx, 'period-2026-3'),
    ).rejects.toThrow(FinancialPeriodClosedError);
  });

  it('allows on OPEN period', async () => {
    prisma.billingPeriod.findUnique.mockResolvedValue({
      id: 'period-2026-3',
      year: 2026,
      month: 3,
      status: BILLING_PERIOD_STATUS.OPEN,
      dueDay: 25,
    } as never);

    const tx = await getTx();
    await expect(
      assertBillingPeriodAllowsBillingEdit(tx, 'period-2026-3'),
    ).resolves.toBeUndefined();
  });
});

describe('assertBillingPeriodAllowsBulkUpdate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws FinancialPeriodClosedError on LOCKED period', async () => {
    prisma.billingPeriod.findUnique.mockResolvedValue({
      id: 'period-2026-3',
      year: 2026,
      month: 3,
      status: BILLING_PERIOD_STATUS.LOCKED,
      dueDay: 25,
    } as never);

    const tx = await getTx();
    await expect(
      assertBillingPeriodAllowsBulkUpdate(tx, 'period-2026-3'),
    ).rejects.toThrow(FinancialPeriodClosedError);
  });

  it('throws FinancialPeriodArchivedError on ARCHIVED period', async () => {
    prisma.billingPeriod.findUnique.mockResolvedValue({
      id: 'period-2026-3',
      year: 2026,
      month: 3,
      status: BILLING_PERIOD_STATUS.ARCHIVED,
      dueDay: 25,
    } as never);

    const tx = await getTx();
    await expect(
      assertBillingPeriodAllowsBulkUpdate(tx, 'period-2026-3'),
    ).rejects.toThrow(FinancialPeriodArchivedError);
  });

  it('allows on OPEN period', async () => {
    prisma.billingPeriod.findUnique.mockResolvedValue({
      id: 'period-2026-3',
      year: 2026,
      month: 3,
      status: BILLING_PERIOD_STATUS.OPEN,
      dueDay: 25,
    } as never);

    const tx = await getTx();
    await expect(
      assertBillingPeriodAllowsBulkUpdate(tx, 'period-2026-3'),
    ).resolves.toBeUndefined();
  });
});

// ── TC-5: createAdjustment escape hatch (integration note) ───────────────────
// The actual createAdjustment test requires the full invoice-legal.service integration
// and is covered in the invoice-legal.service integration tests.
// Here we verify the period check behavior that createAdjustment depends on.
//
// TC-5 behavior is: adjustments are ALLOWED on CLOSED periods.
// The invoice-legal.service.createAdjustment now uses:
//   origBilling.billingPeriod.status === BILLING_PERIOD_STATUS.LOCKED ||
//   origBilling.billingPeriod.status === BILLING_PERIOD_STATUS.ARCHIVED
// This means CLOSED is explicitly allowed (the escape hatch).
// See: src/modules/invoices/invoice-legal.service.ts
//
// This test verifies the period-closing.service correctly distinguishes CLOSED behavior.
describe('TC-5: createAdjustment escape hatch — CLOSED period allows adjustment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('CLOSED period status should NOT block adjustment in assertPeriodAllowsMutation', async () => {
    prisma.billingPeriod.findUnique.mockResolvedValue({
      id: 'period-2026-3',
      year: 2026,
      month: 3,
      status: BILLING_PERIOD_STATUS.CLOSED,
      dueDay: 25,
    } as never);

    // createAdjustment is NOT in BLOCKED_ON_CLOSED list
    // so it should NOT throw
    const tx = await getTx();
    await expect(
      assertPeriodAllowsMutation(tx, 'period-2026-3', 'adjustment_create'),
    ).resolves.toBeUndefined();
  });

  it('LOCKED period status DOES block adjustment operations', async () => {
    prisma.billingPeriod.findUnique.mockResolvedValue({
      id: 'period-2026-3',
      year: 2026,
      month: 3,
      status: BILLING_PERIOD_STATUS.LOCKED,
      dueDay: 25,
    } as never);

    const tx = await getTx();
    await expect(
      assertPeriodAllowsMutation(tx, 'period-2026-3', 'adjustment_create'),
    ).rejects.toThrow(FinancialPeriodClosedError);
  });

  it('ARCHIVED period status DOES block adjustment operations', async () => {
    prisma.billingPeriod.findUnique.mockResolvedValue({
      id: 'period-2026-3',
      year: 2026,
      month: 3,
      status: BILLING_PERIOD_STATUS.ARCHIVED,
      dueDay: 25,
    } as never);

    const tx = await getTx();
    await expect(
      assertPeriodAllowsMutation(tx, 'period-2026-3', 'adjustment_create'),
    ).rejects.toThrow(FinancialPeriodArchivedError);
  });
});
