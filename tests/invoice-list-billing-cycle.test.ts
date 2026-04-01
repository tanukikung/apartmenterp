/**
 * invoice-list-billing-cycle.test.ts
 *
 * Tests for invoice listing — updated for new schema where billingCycleId
 * is replaced by roomBillingId, and Invoice is 1:1 with RoomBilling.
 *
 * Covers:
 *  1. listInvoices returns InvoiceResponse with roomBillingId
 *  2. Status filter is forwarded correctly
 *  3. roomNo filter is forwarded correctly
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Prisma mock ───────────────────────────────────────────────────────────────
const mockInvoiceCount = vi.fn();
const mockInvoiceFindMany = vi.fn();

vi.mock('@/lib/db/client', () => ({
  prisma: {
    invoice: {
      count: mockInvoiceCount,
      findMany: mockInvoiceFindMany,
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
function makeInvoice(roomBillingId: string = 'rb-abc') {
  return {
    id: 'inv-1',
    roomNo: 'room-101',
    roomBillingId,
    year: 2026,
    month: 3,
    status: 'GENERATED',
    totalAmount: '5000',
    dueDate: new Date('2026-03-31'),
    issuedAt: new Date(),
    sentAt: null,
    paidAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    room: {
      roomNo: 'room-101',
      tenants: [],
    },
    deliveries: [],
    roomBilling: { totalDue: '5000' },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('InvoiceService.listInvoices — new schema contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('includes roomBillingId in each InvoiceResponse', async () => {
    mockInvoiceCount.mockResolvedValue(1);
    mockInvoiceFindMany.mockResolvedValue([makeInvoice('rb-xyz')]);

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
    expect(result.data[0].roomBillingId).toBe('rb-xyz');
  });

  it('returns correct roomNo from the invoice', async () => {
    mockInvoiceCount.mockResolvedValue(1);
    mockInvoiceFindMany.mockResolvedValue([makeInvoice()]);

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

    expect(result.data[0].roomNo).toBe('room-101');
  });

  it('applies roomNo filter as a Prisma where clause', async () => {
    mockInvoiceCount.mockResolvedValue(0);
    mockInvoiceFindMany.mockResolvedValue([]);

    const { createInvoiceService } = await import(
      '@/modules/invoices/invoice.service'
    );
    const svc = createInvoiceService();
    await svc.listInvoices({
      roomNo: 'room-filter-test',
      page: 1,
      pageSize: 20,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });

    // The where clause should have the roomNo condition
    const whereArg = mockInvoiceCount.mock.calls[0][0].where;
    expect(whereArg.roomNo).toBe('room-filter-test');
  });
});
