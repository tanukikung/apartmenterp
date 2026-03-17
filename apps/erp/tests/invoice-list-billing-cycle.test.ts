/**
 * invoice-list-billing-cycle.test.ts
 *
 * Tests for the billingCycleId field added to InvoiceResponse via listInvoices.
 *
 * Covers:
 *  1. listInvoices includes billingCycleId in each InvoiceResponse
 *  2. billingCycleId is null when billingRecord has no billingCycleId
 *  3. billingCycleId filter (billingCycleId where clause) is forwarded correctly
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Prisma mock ───────────────────────────────────────────────────────────────
const mockInvoiceCount = vi.fn();
const mockInvoiceFindMany = vi.fn();
const mockBillingItemFindMany = vi.fn();

vi.mock('@/lib/db/client', () => ({
  prisma: {
    invoice: {
      count: mockInvoiceCount,
      findMany: mockInvoiceFindMany,
    },
    billingItem: {
      findMany: mockBillingItemFindMany,
    },
  },
}));

// ── EventBus stub ─────────────────────────────────────────────────────────────
vi.mock('@/lib/events', () => ({
  EventBus: {
    getInstance: () => ({ publish: vi.fn() }),
  },
  EventTypes: {},
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────
function makeInvoice(cycleId: string | null = 'cycle-abc') {
  return {
    id: 'inv-1',
    roomId: 'room-1',
    billingRecordId: 'rec-1',
    year: 2026,
    month: 3,
    version: 1,
    status: 'GENERATED',
    subtotal: '5000',
    total: '5000',
    dueDate: new Date('2026-03-31'),
    issuedAt: new Date(),
    sentAt: null,
    sentBy: null,
    viewedAt: null,
    paidAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    room: {
      id: 'room-1',
      roomNumber: '101',
      floorId: 'floor-1',
      roomTenants: [],
    },
    versions: [],
    deliveries: [],
    billingRecord: { billingCycleId: cycleId },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('InvoiceService.listInvoices — billingCycleId propagation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockBillingItemFindMany.mockResolvedValue([]);
  });

  it('includes billingCycleId from the joined billingRecord', async () => {
    mockInvoiceCount.mockResolvedValue(1);
    mockInvoiceFindMany.mockResolvedValue([makeInvoice('cycle-xyz')]);

    const { createInvoiceService } = await import(
      '@/modules/invoices/invoice.service'
    );
    const svc = createInvoiceService();
    const result = await svc.listInvoices({
      page: 1,
      pageSize: 20,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });

    expect(result.data).toHaveLength(1);
    expect(result.data[0].billingCycleId).toBe('cycle-xyz');
  });

  it('sets billingCycleId to null when billingRecord has no cycle', async () => {
    mockInvoiceCount.mockResolvedValue(1);
    mockInvoiceFindMany.mockResolvedValue([makeInvoice(null)]);

    const { createInvoiceService } = await import(
      '@/modules/invoices/invoice.service'
    );
    const svc = createInvoiceService();
    const result = await svc.listInvoices({
      page: 1,
      pageSize: 20,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });

    expect(result.data[0].billingCycleId).toBeNull();
  });

  it('applies billingCycleId filter as a Prisma nested where', async () => {
    mockInvoiceCount.mockResolvedValue(0);
    mockInvoiceFindMany.mockResolvedValue([]);

    const { createInvoiceService } = await import(
      '@/modules/invoices/invoice.service'
    );
    const svc = createInvoiceService();
    await svc.listInvoices({
      billingCycleId: 'cycle-filter-test',
      page: 1,
      pageSize: 20,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });

    // The where clause should have the nested billingRecord condition
    const whereArg = mockInvoiceCount.mock.calls[0][0].where;
    expect(whereArg.billingRecord).toEqual({ is: { billingCycleId: 'cycle-filter-test' } });
  });
});
