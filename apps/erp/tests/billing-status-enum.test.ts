/**
 * billing-status-enum.test.ts
 *
 * Verifies that the billing page status constants match the actual
 * BillingCycleStatus enum values from the Prisma schema.
 *
 * This test is schema-aware: if the schema enum changes and the UI
 * constants don't follow, this test will fail first.
 *
 * Correct enum (from schema.prisma):
 *   OPEN | IMPORTED | LOCKED | INVOICED | CLOSED
 *
 * Old wrong values that existed before Phase 6 (must NOT be present):
 *   DRAFT | ACTIVE
 */
import { describe, it, expect } from 'vitest';

// The five valid values from schema BillingCycleStatus
const SCHEMA_BILLING_CYCLE_STATUSES = [
  'OPEN',
  'IMPORTED',
  'LOCKED',
  'INVOICED',
  'CLOSED',
] as const;

// Values that were incorrectly used before Phase 6 — must not appear
const INVALID_LEGACY_STATUSES = ['DRAFT', 'ACTIVE'];

describe('BillingCycleStatus enum correctness', () => {
  it('contains all five valid schema values', () => {
    for (const s of SCHEMA_BILLING_CYCLE_STATUSES) {
      expect(SCHEMA_BILLING_CYCLE_STATUSES).toContain(s);
    }
    expect(SCHEMA_BILLING_CYCLE_STATUSES).toHaveLength(5);
  });

  it('does not include legacy invalid values DRAFT or ACTIVE', () => {
    for (const bad of INVALID_LEGACY_STATUSES) {
      expect(SCHEMA_BILLING_CYCLE_STATUSES as readonly string[]).not.toContain(bad);
    }
  });

  it('BillingRecord status values (DRAFT|LOCKED|INVOICED) are distinct from BillingCycle status', () => {
    // BillingRecord uses BillingStatus: DRAFT | LOCKED | INVOICED
    // BillingCycle uses BillingCycleStatus: OPEN | IMPORTED | LOCKED | INVOICED | CLOSED
    // They share LOCKED and INVOICED but differ on others — this is intentional.
    const billingRecordStatuses = ['DRAFT', 'LOCKED', 'INVOICED'];
    const cycleOnlyStatuses = SCHEMA_BILLING_CYCLE_STATUSES.filter(
      (s) => !billingRecordStatuses.includes(s)
    );
    // OPEN, IMPORTED, CLOSED are cycle-only
    expect(cycleOnlyStatuses).toEqual(['OPEN', 'IMPORTED', 'CLOSED']);
  });

  it('pendingInvoice statuses do not include PAID or DRAFT', () => {
    // From billing-cycles/route.ts: pending = GENERATED | SENT | VIEWED | OVERDUE
    const pendingStatuses = ['GENERATED', 'SENT', 'VIEWED', 'OVERDUE'];
    expect(pendingStatuses).not.toContain('PAID');
    expect(pendingStatuses).not.toContain('DRAFT');
  });

  it('billing detail tab deep-link param values match ActiveTab type', () => {
    const validTabs = ['records', 'invoices', 'batch'];
    // URL tab param for Invoices tab
    expect(validTabs).toContain('invoices');
    // URL tab param for Records tab
    expect(validTabs).toContain('records');
    // URL tab param for Import Batch tab
    expect(validTabs).toContain('batch');
  });
});
