/**
 * @file domain-boundaries.ts
 *
 * Single source of truth for the Apartment ERP domain model.
 *
 * These descriptions are enforced by code review. Before adding a new feature
 * to any of the pages or modules listed here, confirm it belongs to that
 * domain — not an adjacent one.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * CORE DOMAIN ENTITIES
 * ────────────────────────────────────────────────────────────────────────────
 *
 * BillingCycle (billing_cycles table)
 *   Monthly operational container per building.
 *   Lifecycle: OPEN → IMPORTED → LOCKED → INVOICED → CLOSED
 *   Owns: BillingRecord[], BillingImportBatch[], GeneratedDocument[] (via cycle)
 *   Route: /admin/billing (list), /admin/billing/[id] (cycle detail)
 *
 * BillingRecord (billing_records table)
 *   Per-room financial truth for a single billing period.
 *   Lifecycle: DRAFT → LOCKED → INVOICED
 *   Owned by: BillingCycle (via billingCycleId)
 *   Owns: BillingItem[], Invoice[]
 *
 * Invoice (invoices table)
 *   Financial delivery/lifecycle entity, 1:1 with a BillingRecord.
 *   Lifecycle: DRAFT → GENERATED → SENT → VIEWED → PAID | OVERDUE
 *   Contains: InvoiceVersion[] (mutation audit), InvoiceDelivery[] (channel records)
 *   Route: /admin/invoices (cross-cycle monitoring), /admin/billing/[id] (cycle actions)
 *   ⚠️  NOT the same as GeneratedDocument — see below.
 *
 * Payment (payments table)
 *   Records cash receipt. May match to Invoice via PaymentMatch.
 *   Route: /admin/payments
 *
 * GeneratedDocument (generated_documents table)
 *   Rendered artifact produced by the document template engine.
 *   Lifecycle: GENERATED → EXPORTED | FAILED
 *   Created by: DocumentGenerationJob (async batch renderer)
 *   May reference: Invoice, BillingRecord, Contract, Tenant
 *   ⚠️  NOT a financial entity — it is a rendered file, not a billing record.
 *   Route: /admin/documents (artifact viewer), /admin/documents/generate (generator)
 *
 * DocumentTemplate (document_templates table)
 *   User-editable HTML/Handlebars template for any document type
 *   (INVOICE, PAYMENT_NOTICE, RECEIPT, CUSTOM).
 *   Route: /admin/templates
 *
 * ────────────────────────────────────────────────────────────────────────────
 * UI PAGE BOUNDARIES
 * ────────────────────────────────────────────────────────────────────────────
 *
 * /admin/billing
 *   Purpose: Billing cycle list — import, filter, navigate to cycle detail.
 *   Data source: GET /api/billing-cycles (BillingCycle aggregate)
 *   Must NOT contain: Invoice send actions, document generation triggers.
 *
 * /admin/billing/[id]
 *   Purpose: Cycle-scoped action center.
 *   Actions allowed: generate invoices, bulk send invoices for this cycle,
 *                    view import batch validation, view billing records.
 *   Data sources: GET /api/billing-cycles/[id], GET /api/invoices?billingCycleId=
 *   Must NOT contain: cross-cycle invoice queries, template rendering.
 *
 * /admin/invoices
 *   Purpose: Cross-cycle invoice monitoring and search (READ-HEAVY).
 *   Actions allowed: row-level Send (convenience, reuses POST /api/invoices/[id]/send),
 *                    PDF download, navigate to billing cycle detail.
 *   Data source: GET /api/invoices (Invoice lifecycle data)
 *   Must NOT contain: Generate Invoice button, bulk cycle actions, import logic.
 *   Must NOT show: GeneratedDocument records (those belong in /admin/documents).
 *
 * /admin/documents
 *   Purpose: GeneratedDocument artifact viewer — rendered PDFs/DOCX outputs.
 *   Data source: GET /api/documents (GeneratedDocument records)
 *   Must NOT contain: Invoice lifecycle tracking (sent/viewed/paid/overdue).
 *   ⚠️  This page was previously the redirect target of /admin/invoices — that
 *       was a defect corrected in Phase 6. The two pages serve different domains.
 *
 * /admin/documents/generate
 *   Purpose: Template rendering engine — select template + scope + generate batch.
 *   Must NOT contain: Billing cycle lifecycle management.
 *
 * /admin/overdue
 *   Purpose: OVERDUE invoice alert and reminder workflow.
 *   Actions allowed: Send Reminder (LINE), export CSV, navigate to billing cycle.
 *   Data source: GET /api/invoices?status=OVERDUE
 *   "View Invoice" links to /admin/billing/[cycleId]?tab=invoices when
 *   billingCycleId is available; falls back to /admin/invoices.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ANALYTICS SOURCE OF TRUTH
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Financial analytics (revenue, occupancy rates, payment rates) must be
 * computed from BillingRecord.subtotal and Payment.amount — NOT from
 * GeneratedDocument counts or Invoice delivery metadata.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * GUARD RAILS
 * ────────────────────────────────────────────────────────────────────────────
 *
 * 1. Invoice generation belongs in /admin/billing/[id] only.
 *    It requires a LOCKED BillingRecord — that context only exists in the cycle view.
 *
 * 2. GeneratedDocument creation belongs in /admin/documents/generate only.
 *    It requires a DocumentTemplate — unrelated to Invoice lifecycle.
 *
 * 3. The send endpoint POST /api/invoices/[id]/send is the single canonical
 *    command for all send surfaces (billing detail, invoice monitoring, overdue).
 *    Do not create parallel send implementations.
 *
 * 4. billingCycleId is available on InvoiceResponse (via listInvoices join).
 *    Use it for deep-linking: /admin/billing/[billingCycleId]?tab=invoices.
 *    Do not navigate to /admin/documents for invoice-related intent.
 */

// ---------------------------------------------------------------------------
// Exported constants — usable in tests to assert domain boundaries
// ---------------------------------------------------------------------------

/** Canonical BillingCycleStatus values. Any UI status filter must match these. */
export const BILLING_CYCLE_STATUSES = [
  'OPEN',
  'IMPORTED',
  'LOCKED',
  'INVOICED',
  'CLOSED',
] as const;

export type BillingCycleStatus = (typeof BILLING_CYCLE_STATUSES)[number];

/** Invoice statuses that represent unresolved (actionable) invoices. */
export const PENDING_INVOICE_STATUSES = [
  'GENERATED',
  'SENT',
  'VIEWED',
  'OVERDUE',
] as const;

/** Invoice statuses where a row-level Send action makes sense. */
export const SENDABLE_INVOICE_STATUSES = [
  'GENERATED',
  'SENT',
  'VIEWED',
] as const;

/** The tabs available on /admin/billing/[id]. Used for ?tab= deep-linking. */
export const BILLING_DETAIL_TABS = ['records', 'invoices', 'batch'] as const;
export type BillingDetailTab = (typeof BILLING_DETAIL_TABS)[number];

/**
 * Resolve the deep-link URL for a specific invoice from a context page.
 * Prefers the billing cycle detail (most specific) over a generic fallback.
 */
export function invoiceDeepLink(inv: {
  billingCycleId?: string | null;
}): string {
  if (inv.billingCycleId) {
    return `/admin/billing/${inv.billingCycleId}?tab=invoices`;
  }
  return `/admin/invoices`;
}
