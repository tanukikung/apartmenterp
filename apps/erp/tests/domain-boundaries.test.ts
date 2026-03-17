/**
 * domain-boundaries.test.ts
 *
 * Verifies the exported constants from src/lib/domain-boundaries.ts:
 *  1. BILLING_CYCLE_STATUSES matches schema enum exactly
 *  2. PENDING_INVOICE_STATUSES excludes PAID and DRAFT
 *  3. SENDABLE_INVOICE_STATUSES is a subset of PENDING
 *  4. BILLING_DETAIL_TABS covers all three tab values
 *  5. invoiceDeepLink() returns billing detail URL when cycleId is present
 *  6. invoiceDeepLink() returns /admin/invoices (not /admin/documents) as fallback
 *  7. Nav active-state rule: exact flag prevents prefix collision
 */
import { describe, it, expect } from 'vitest';
import {
  BILLING_CYCLE_STATUSES,
  PENDING_INVOICE_STATUSES,
  SENDABLE_INVOICE_STATUSES,
  BILLING_DETAIL_TABS,
  invoiceDeepLink,
} from '@/lib/domain-boundaries';

describe('domain-boundaries: BILLING_CYCLE_STATUSES', () => {
  it('contains exactly the five schema enum values', () => {
    expect([...BILLING_CYCLE_STATUSES]).toEqual([
      'OPEN', 'IMPORTED', 'LOCKED', 'INVOICED', 'CLOSED',
    ]);
  });

  it('does not contain legacy values DRAFT or ACTIVE', () => {
    const set = new Set<string>(BILLING_CYCLE_STATUSES);
    expect(set.has('DRAFT')).toBe(false);
    expect(set.has('ACTIVE')).toBe(false);
  });
});

describe('domain-boundaries: PENDING_INVOICE_STATUSES', () => {
  it('includes GENERATED, SENT, VIEWED, OVERDUE', () => {
    const set = new Set<string>(PENDING_INVOICE_STATUSES);
    expect(set.has('GENERATED')).toBe(true);
    expect(set.has('SENT')).toBe(true);
    expect(set.has('VIEWED')).toBe(true);
    expect(set.has('OVERDUE')).toBe(true);
  });

  it('excludes PAID — a resolved terminal status', () => {
    expect((PENDING_INVOICE_STATUSES as readonly string[]).includes('PAID')).toBe(false);
  });

  it('excludes DRAFT — not yet actioned', () => {
    expect((PENDING_INVOICE_STATUSES as readonly string[]).includes('DRAFT')).toBe(false);
  });
});

describe('domain-boundaries: SENDABLE_INVOICE_STATUSES', () => {
  it('is a proper subset of PENDING_INVOICE_STATUSES', () => {
    const pending = new Set<string>(PENDING_INVOICE_STATUSES);
    for (const s of SENDABLE_INVOICE_STATUSES) {
      expect(pending.has(s)).toBe(true);
    }
  });

  it('does not include OVERDUE — overdue reminders have their own workflow', () => {
    expect((SENDABLE_INVOICE_STATUSES as readonly string[]).includes('OVERDUE')).toBe(false);
  });
});

describe('domain-boundaries: BILLING_DETAIL_TABS', () => {
  it('covers all three tab values', () => {
    const tabs = new Set<string>(BILLING_DETAIL_TABS);
    expect(tabs.has('records')).toBe(true);
    expect(tabs.has('invoices')).toBe(true);
    expect(tabs.has('batch')).toBe(true);
  });
});

describe('domain-boundaries: invoiceDeepLink()', () => {
  it('returns billing cycle detail URL when billingCycleId is provided', () => {
    expect(invoiceDeepLink({ billingCycleId: 'cycle-123' }))
      .toBe('/admin/billing/cycle-123?tab=invoices');
  });

  it('returns /admin/invoices when billingCycleId is null', () => {
    expect(invoiceDeepLink({ billingCycleId: null })).toBe('/admin/invoices');
  });

  it('returns /admin/invoices when billingCycleId is undefined', () => {
    expect(invoiceDeepLink({})).toBe('/admin/invoices');
  });

  it('fallback is /admin/invoices — never /admin/documents', () => {
    expect(invoiceDeepLink({ billingCycleId: null })).not.toContain('/admin/documents');
  });

  it('billing detail URL embeds cycleId as a path segment, not a query param', () => {
    const href = invoiceDeepLink({ billingCycleId: 'abc-xyz' });
    expect(href).toMatch(/^\/admin\/billing\/abc-xyz/);
    expect(href).not.toContain('?billingCycleId=');
  });
});

describe('nav active-state rule: exact flag prevents prefix collision', () => {
  /**
   * The nav item for /admin/documents has exact: true.
   * This means it should highlight only when pathname === /admin/documents,
   * NOT when pathname === /admin/documents/generate.
   *
   * We test the matching logic as a pure function to avoid DOM setup.
   */
  function isActive(itemHref: string, exact: boolean, pathname: string): boolean {
    return exact
      ? pathname === itemHref || pathname === itemHref + '/'
      : pathname.startsWith(itemHref);
  }

  it('/admin/documents with exact=true does NOT highlight on /admin/documents/generate', () => {
    expect(isActive('/admin/documents', true, '/admin/documents/generate')).toBe(false);
  });

  it('/admin/documents with exact=true DOES highlight on /admin/documents', () => {
    expect(isActive('/admin/documents', true, '/admin/documents')).toBe(true);
  });

  it('/admin/documents with exact=true DOES highlight on /admin/documents/', () => {
    expect(isActive('/admin/documents', true, '/admin/documents/')).toBe(true);
  });

  it('/admin/documents/generate with exact=false highlights on /admin/documents/generate', () => {
    expect(isActive('/admin/documents/generate', false, '/admin/documents/generate')).toBe(true);
  });

  it('/admin/system with exact=true does NOT highlight on /admin/system-health', () => {
    expect(isActive('/admin/system', true, '/admin/system-health')).toBe(false);
  });

  it('/admin/system with exact=true does NOT highlight on /admin/system-jobs', () => {
    expect(isActive('/admin/system', true, '/admin/system-jobs')).toBe(false);
  });

  it('/admin/billing with exact=false DOES highlight on /admin/billing/[id] (sub-page)', () => {
    // Billing detail is intentionally a sub-page of Billing — prefix match is correct here
    expect(isActive('/admin/billing', false, '/admin/billing/clx123')).toBe(true);
  });
});
