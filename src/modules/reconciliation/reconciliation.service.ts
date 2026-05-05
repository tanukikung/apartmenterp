/**
 * Phase 8.3: Reconciliation Engine
 *
 * Background job that detects financial inconsistencies:
 * - INVOICE_PAYMENT_MISMATCH: sum(confirmed payments) != invoice.totalAmount for PAID invoices
 * - PAID_INVOICE_NO_PAYMENT: status=PAID but no CONFIRMED payment row exists
 * - NEGATIVE_BALANCE: sum(payments) > invoice.totalAmount (overpayment)
 * - DUPLICATE_PAYMENT_MATCH: same payment matched to same invoice twice
 */

import { prisma, withTransaction } from '@/lib/db/client';
import { logger } from '@/lib/utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { Prisma } from '@/lib/db/client';
import { alertReconciliationIssues } from '@/lib/alerting/alerts';

export type ReconciliationIssueType =
  | 'INVOICE_PAYMENT_MISMATCH'
  | 'PAID_INVOICE_NO_PAYMENT'
  | 'NEGATIVE_BALANCE'
  | 'DUPLICATE_PAYMENT_MATCH';

export type IssueSeverity = 'CRITICAL' | 'WARNING' | 'INFO';

interface IssueInput {
  type: ReconciliationIssueType;
  entityType: string;
  entityId: string;
  severity: IssueSeverity;
  description: string;
  metadata?: Record<string, unknown>;
}

export class ReconciliationService {
  /**
   * Run all reconciliation checks inside a single transaction.
   * Returns all issues found (newly created or re-detected unresolved ones).
   */
  async runDailyReconciliation(): Promise<{
    issues: Array<{ id: string; type: string; entityId: string; severity: string; description: string; detectedAt: Date }>;
    fixed: number;
    checked: {
      invoicePaymentMismatch: number;
      orphanPaidInvoices: number;
      overpayments: number;
      duplicateMatches: number;
    };
  }> {
    return withTransaction(async (tx) => {
      const results = {
        issues: [] as Array<{ id: string; type: string; entityId: string; severity: string; description: string; detectedAt: Date }>,
        fixed: 0,
        checked: { invoicePaymentMismatch: 0, orphanPaidInvoices: 0, overpayments: 0, duplicateMatches: 0 },
      };

      // ── Check 1: INVOICE_PAYMENT_MISMATCH ─────────────────────────────────
      // For PAID invoices, sum(confirmed payments) must equal totalAmount
      const mismatches = await tx.$queryRaw<Array<{ invoiceId: string; invoiceTotal: string; sumPayments: string }>>`
        SELECT
          i.id AS "invoiceId",
          i."totalAmount"::text AS "invoiceTotal",
          COALESCE(SUM(p.amount), 0)::text AS "sumPayments"
        FROM invoices i
        LEFT JOIN payments p ON p."matchedInvoiceId" = i.id AND p.status = 'CONFIRMED'
        WHERE i.status = 'PAID'
        GROUP BY i.id, i."totalAmount"
        HAVING ABS(i."totalAmount" - COALESCE(SUM(p.amount), 0)) > 0.01
      `;
      results.checked.invoicePaymentMismatch = mismatches.length;

      for (const row of mismatches) {
        const issue = await this.upsertIssue(tx, {
          type: 'INVOICE_PAYMENT_MISMATCH',
          entityType: 'Invoice',
          entityId: row.invoiceId,
          severity: 'CRITICAL',
          description: `Invoice total ${row.invoiceTotal} THB != sum of confirmed payments ${row.sumPayments} THB`,
          metadata: { invoiceTotal: row.invoiceTotal, sumPayments: row.sumPayments },
        });
        results.issues.push(issue);
      }

      // ── Check 2: PAID_INVOICE_NO_PAYMENT ───────────────────────────────────
      // Invoice is PAID but has no confirmed payment row
      const orphanPaid = await tx.$queryRaw<Array<{ id: string; totalAmount: string }>>`
        SELECT i.id, i."totalAmount"::text AS "totalAmount"
        FROM invoices i
        LEFT JOIN payments p ON p."matchedInvoiceId" = i.id AND p.status = 'CONFIRMED'
        WHERE i.status = 'PAID' AND p.id IS NULL
      `;
      results.checked.orphanPaidInvoices = orphanPaid.length;

      for (const row of orphanPaid) {
        const issue = await this.upsertIssue(tx, {
          type: 'PAID_INVOICE_NO_PAYMENT',
          entityType: 'Invoice',
          entityId: row.id,
          severity: 'CRITICAL',
          description: `Invoice ${row.id} is marked PAID but no confirmed payment row exists`,
          metadata: { invoiceTotal: row.totalAmount },
        });
        results.issues.push(issue);
      }

      // ── Check 3: NEGATIVE_BALANCE (overpayment) ─────────────────────────────
      // Sum of confirmed payments > invoice totalAmount
      const overpayments = await tx.$queryRaw<Array<{ invoiceId: string; invoiceTotal: string; sumPayments: string; overpayAmount: string }>>`
        SELECT
          i.id AS "invoiceId",
          i."totalAmount"::text AS "invoiceTotal",
          COALESCE(SUM(p.amount), 0)::text AS "sumPayments",
          (COALESCE(SUM(p.amount), 0) - i."totalAmount")::text AS "overpayAmount"
        FROM invoices i
        JOIN payments p ON p."matchedInvoiceId" = i.id AND p.status = 'CONFIRMED'
        GROUP BY i.id, i."totalAmount"
        HAVING SUM(p.amount) > i."totalAmount" + 0.01
      `;
      results.checked.overpayments = overpayments.length;

      for (const row of overpayments) {
        const issue = await this.upsertIssue(tx, {
          type: 'NEGATIVE_BALANCE',
          entityType: 'Invoice',
          entityId: row.invoiceId,
          severity: 'CRITICAL',
          description: `Overpayment: sum ${row.sumPayments} THB exceeds invoice total ${row.invoiceTotal} THB by ${row.overpayAmount} THB`,
          metadata: { invoiceTotal: row.invoiceTotal, sumPayments: row.sumPayments, overpayAmount: row.overpayAmount },
        });
        results.issues.push(issue);
      }

      // ── Check 4: DUPLICATE_PAYMENT_MATCH ───────────────────────────────────
      // Same payment-invoice pair matched more than once with CONFIRMED status
      const duplicates = await tx.$queryRaw<Array<{ paymentId: string; invoiceId: string; count: string }>>`
        SELECT "paymentId", "invoiceId", COUNT(*)::text AS "count"
        FROM payment_matches
        WHERE status = 'CONFIRMED'
        GROUP BY "paymentId", "invoiceId"
        HAVING COUNT(*) > 1
      `;
      results.checked.duplicateMatches = duplicates.length;

      for (const row of duplicates) {
        const issue = await this.upsertIssue(tx, {
          type: 'DUPLICATE_PAYMENT_MATCH',
          entityType: 'Payment',
          entityId: row.paymentId,
          severity: 'WARNING',
          description: `Payment ${row.paymentId} matched to invoice ${row.invoiceId} ${row.count} times (confirmed)`,
          metadata: { invoiceId: row.invoiceId, matchCount: parseInt(row.count, 10) },
        });
        results.issues.push(issue);
      }

      return results;
    }).then(async (results) => {
      // Alert on CRITICAL reconciliation issues (async, non-blocking)
      const criticalIssues = results.issues.filter(i => i.severity === 'CRITICAL');
      if (criticalIssues.length > 0) {
        alertReconciliationIssues(criticalIssues).catch((e) => {
          logger.error({ type: 'alert_reconciliation_failed', error: e instanceof Error ? e.message : String(e) });
        });
      }
      return results;
    });
  }

  /**
   * Upsert a reconciliation issue — only creates new if no unresolved issue
   * of the same type+entityId already exists.
   */
  private async upsertIssue(
    tx: Prisma.TransactionClient,
    input: IssueInput,
  ): Promise<{ id: string; type: string; entityId: string; severity: string; description: string; detectedAt: Date }> {
    const existing = await tx.reconciliationIssue.findFirst({
      where: { type: input.type, entityId: input.entityId, resolvedAt: null },
    });

    if (existing) {
      // Update description/severity if changed, bump detectedAt
      const updated = await tx.reconciliationIssue.update({
        where: { id: existing.id },
        data: { severity: input.severity, description: input.description, metadata: input.metadata as Prisma.InputJsonValue },
      });
      return updated as unknown as { id: string; type: string; entityId: string; severity: string; description: string; detectedAt: Date };
    }

    const created = await tx.reconciliationIssue.create({
      data: {
        id: uuidv4(),
        type: input.type,
        entityType: input.entityType,
        entityId: input.entityId,
        severity: input.severity,
        description: input.description,
        metadata: input.metadata as Prisma.InputJsonValue,
        detectedAt: new Date(),
      },
    });
    return created as unknown as { id: string; type: string; entityId: string; severity: string; description: string; detectedAt: Date };
  }

  /**
   * Resolve an issue (manually or automatically).
   */
  async resolveIssue(
    issueId: string,
    resolvedBy: string,
    resolution: 'FIXED' | 'IGNORED' | 'AUTO_FIXED',
    notes?: string,
  ): Promise<void> {
    await prisma.reconciliationIssue.update({
      where: { id: issueId },
      data: {
        resolvedAt: new Date(),
        resolvedBy,
        resolution,
      },
    });

    logger.info({ type: 'reconciliation_issue_resolved', issueId, resolvedBy, resolution, notes });
  }

  /**
   * List unresolved issues (for admin UI).
   */
  async listUnresolved(severity?: IssueSeverity) {
    return prisma.reconciliationIssue.findMany({
      where: {
        resolvedAt: null,
        ...(severity ? { severity } : {}),
      },
      orderBy: [
        { severity: 'asc' },   // CRITICAL first
        { detectedAt: 'desc' },
      ],
    });
  }
}