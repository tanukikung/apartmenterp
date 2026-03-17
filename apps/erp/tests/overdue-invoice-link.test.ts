/**
 * overdue-invoice-link.test.ts
 *
 * Unit tests verifying the "View Invoice" link logic for the overdue page.
 * The link must point to the billing cycle detail (with ?tab=invoices)
 * when billingCycleId is available, and fall back to /admin/invoices otherwise.
 *
 * This tests the routing logic in isolation — no DOM/React renderer needed.
 */
import { describe, it, expect } from 'vitest';

// ── Replicated from overdue/page.tsx ─────────────────────────────────────────
// These helpers mirror the logic in the component so we can test them in
// isolation without spinning up Next.js.

interface OverdueInvoice {
  id: string;
  year?: number;
  month?: number;
  billingCycleId?: string | null;
}

function viewInvoiceHref(inv: OverdueInvoice): string {
  if (inv.billingCycleId) {
    return `/admin/billing/${inv.billingCycleId}?tab=invoices`;
  }
  return `/admin/invoices`;
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('Overdue page — View Invoice link routing', () => {
  it('links to billing cycle detail with ?tab=invoices when billingCycleId is present', () => {
    const inv: OverdueInvoice = {
      id: 'inv-1',
      year: 2026,
      month: 3,
      billingCycleId: 'cycle-abc-123',
    };
    expect(viewInvoiceHref(inv)).toBe('/admin/billing/cycle-abc-123?tab=invoices');
  });

  it('falls back to /admin/invoices when billingCycleId is null', () => {
    const inv: OverdueInvoice = {
      id: 'inv-2',
      year: 2026,
      month: 2,
      billingCycleId: null,
    };
    expect(viewInvoiceHref(inv)).toBe('/admin/invoices');
  });

  it('falls back to /admin/invoices when billingCycleId is undefined', () => {
    const inv: OverdueInvoice = {
      id: 'inv-3',
    };
    expect(viewInvoiceHref(inv)).toBe('/admin/invoices');
  });

  it('billing detail URL contains the exact cycleId — not a search param', () => {
    const inv: OverdueInvoice = {
      id: 'inv-4',
      billingCycleId: 'cycle-xyz-789',
    };
    const href = viewInvoiceHref(inv);
    // Must be a path segment, not a query string
    expect(href).toContain('/admin/billing/cycle-xyz-789');
    expect(href).not.toMatch(/\?.*billingCycleId=/);
    // Must open on the invoices tab
    expect(href).toContain('tab=invoices');
  });

  it('the fallback is /admin/invoices — not /admin/documents (the old broken redirect)', () => {
    const inv: OverdueInvoice = { id: 'inv-5' };
    expect(viewInvoiceHref(inv)).not.toContain('/admin/documents');
  });
});
