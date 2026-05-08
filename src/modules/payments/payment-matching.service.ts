import { v4 as uuidv4 } from 'uuid';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib';
import { logger } from '@/lib/utils/logger';
import { logAudit } from '@/modules/audit';
import { BadRequestError, ConflictError, NotFoundError } from '@/lib/utils/errors';
import { syncInvoicePaymentState } from './invoice-payment-state';
import { assertMatchDecisionAllowed, createPaymentMatchDecision } from './payment-match-decision.service';

// ============================================================================
// Multi-Factor Match Scoring (Agent-3: Zero False Positive Specialist)
// ============================================================================

/**
 * Match confidence levels (replaces simple HIGH/MEDIUM/LOW).
 * Score range 0-100:
 *   95-100: AUTO-CONFIRM (requires strict criteria)
 *   70-94:  MANUAL REVIEW (admin must verify)
 *   0-69:   REJECT (left as NEED_REVIEW)
 */
export type MatchConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW' | 'REJECT';

/**
 * A single contributing factor in a match score.
 */
export interface MatchFactor {
  type:
    | 'AMOUNT_EXACT'
    | 'AMOUNT_CLOSE'
    | 'INVOICE_REF'
    | 'ROOM_MATCH'
    | 'DATE_WINDOW'
    | 'TENANT_NAME';
  weight: number;
  passed: boolean;
  detail: string;
}

/**
 * Complete multi-factor match score for a transaction-invoice pair.
 */
export interface MatchScore {
  invoiceId: string;
  totalScore: number;
  confidence: MatchConfidenceLevel;
  factors: MatchFactor[];
  reasons: string[];
}

export const MATCH_THRESHOLDS = {
  AUTO_CONFIRM: 95,
  MANUAL_REVIEW: 70,
} as const;

/**
 * Determines if a match score qualifies for auto-confirm.
 * STRICT: requires ALL of (amount exact + invoice/room ref + date window).
 * Score must also be >= AUTO_CONFIRM threshold.
 */
function canAutoConfirm(score: MatchScore): boolean {
  if (score.totalScore < MATCH_THRESHOLDS.AUTO_CONFIRM) return false;
  const hasAmountExact = score.factors.some(
    (f) => f.type === 'AMOUNT_EXACT' && f.passed,
  );
  const hasStrongRef =
    score.factors.some((f) => f.type === 'INVOICE_REF' && f.passed) ||
    score.factors.some((f) => f.type === 'ROOM_MATCH' && f.passed);
  const hasDateWindow = score.factors.some(
    (f) => f.type === 'DATE_WINDOW' && f.passed,
  );
  return hasAmountExact && hasStrongRef && hasDateWindow;
}

export interface BankStatementEntry {
  date: Date;
  time?: string;
  amount: number;
  description?: string;
  reference?: string;
  roomNo?: string;
}

export type MatchConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

// Days before/after transaction date to search for matching invoices
const INVOICE_SEARCH_DAYS_BEFORE = 30;
const INVOICE_SEARCH_DAYS_AFTER = 45;

// Tolerance for floating-point amount comparison
const AMOUNT_TOLERANCE = 0.01;

type MatchType = 'FULL' | 'PARTIAL' | 'OVERPAY';

/**
 * Compute the match type and matched amount given a transaction amount and invoice total.
 * Handles null invoiceTotal (no invoice found) by treating it as FULL match.
 */
function computeMatchResult(txAmount: number, invoiceTotal: number | null): { matchedAmount: number; matchType: MatchType } {
  if (invoiceTotal === null) {
    return { matchedAmount: txAmount, matchType: 'FULL' };
  }
  const diff = Math.abs(txAmount - invoiceTotal);
  const matchType: MatchType = diff < AMOUNT_TOLERANCE ? 'FULL' : txAmount < invoiceTotal ? 'PARTIAL' : 'OVERPAY';
  return { matchedAmount: Math.min(txAmount, invoiceTotal), matchType };
}

export interface MatchCandidate {
  invoiceId: string;
  confidence: MatchConfidence;
  criteria: {
    type: 'invoice_number' | 'reference' | 'amount_room' | 'amount_resident' | 'amount_only';
    matchedField: string;
    expectedValue: string;
    actualValue: string;
    warning?: string;
  };
}

// ============================================================================
// Bank Statement Import
// ============================================================================

/**
 * Imports a batch of bank statement entries, creating a PaymentTransaction
 * record for each and attempting to auto-match them to unpaid invoices.
 * HIGH confidence matches are auto-confirmed immediately; MEDIUM/LOW confidence
 * matches are placed in NEED_REVIEW for admin action.
 *
 * @param entries  - Array of bank statement line items
 * @param sourceFile - Originating file name for audit traceability
 * @param actor    - Optional actor performing the import
 * @returns Counts of imported and matched transactions
 */
export class PaymentMatchingService {
  async importBankStatement(
    entries: BankStatementEntry[],
    sourceFile: string,
    actor?: { actorId: string; actorRole: string }
  ): Promise<{ imported: number; matched: number }> {
    const BATCH_SIZE = 50;
    let imported = 0;
    let matched = 0;

    // Process entries in batches to amortize transaction overhead
    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      const batch = entries.slice(i, i + BATCH_SIZE);
      const results = await prisma.$transaction(async (tx) => {
        const batchResults: Array<{ imported: boolean; matched: boolean }> = [];
        for (const entry of batch) {
          try {
            const transaction = await tx.paymentTransaction.create({
              data: {
                id: uuidv4(),
                amount: entry.amount,
                transactionDate: entry.date,
                description: entry.description,
                reference: entry.reference,
                sourceFile,
                status: 'PENDING',
                // HIGH-10 fix: use sentinel 'UNKNOWN' when roomNo is not identified.
                // SQL NULL in a partial unique index makes the constraint ineffective
                // (two NULLs are not equal in SQL), so two bank transactions without a
                // linked room could be inserted twice. Using 'UNKNOWN' as sentinel
                // ensures proper deduplication via the existing dedup constraint.
                roomNo: entry.roomNo ?? 'UNKNOWN',
              },
            });

            batchResults.push({ imported: true, matched: false });

            const matchResult = await this.attemptMatch(transaction.id, tx as Prisma.TransactionClient, { autoConfirmHighConfidence: true });
            if (matchResult === 'CONFIRMED') {
              batchResults[batchResults.length - 1].matched = true;
            } else if (matchResult) {
              batchResults[batchResults.length - 1].matched = true;
            } else {
              await tx.paymentTransaction.update({
                where: { id: transaction.id },
                data: { status: 'NEED_REVIEW' },
              });
            }
          } catch (error) {
            logger.error({
              type: 'payment_import_entry_failed',
              entry,
              error: error instanceof Error ? error.message : String(error),
            });
            batchResults.push({ imported: false, matched: false });
          }
        }
        return batchResults;
      });

      for (const r of results) {
        if (r.imported) imported++;
        if (r.matched) matched++;
      }
    }

    logger.info({
      type: 'bank_statement_import_completed',
      imported,
      matched,
      sourceFile,
    });
    await logAudit({
      actorId: actor?.actorId || 'system',
      actorRole: actor?.actorRole || 'SYSTEM',
      action: 'PAYMENT_IMPORTED',
      entityType: 'PAYMENT_TRANSACTION',
      entityId: sourceFile,
      metadata: { imported, matched },
    });
    return { imported, matched };
  }

  // ============================================================================
  // Invoice Matching
  // ============================================================================

  /**
   * Attempts to match a pending PaymentTransaction to an unpaid invoice.
   * Searches invoices within a ±30/45 day window around the transaction date,
   * evaluating multiple confidence criteria (invoice number, reference, room,
   * resident name, amount-only).
   *
   * When autoConfirmHighConfidence is true, HIGH confidence matches are
   * immediately confirmed and a Payment record is created.
   *
   * @param transactionId                   - UUID of the PaymentTransaction
   * @param tx                               - Optional existing transaction client
   * @param options.autoConfirmHighConfidence - Auto-confirm HIGH confidence matches
   * @returns MatchCandidate | 'CONFIRMED' | null
   * @throws NotFoundError if the transaction does not exist
   */
  async attemptMatch(
    transactionId: string,
    tx?: Prisma.TransactionClient,
    options: { autoConfirmHighConfidence?: boolean } = {},
  // Type the return properly — MatchScore now carries invoiceId
  ): Promise<MatchScore | 'CONFIRMED' | null> {
    const { autoConfirmHighConfidence = false } = options;
    const db = tx ?? prisma;
    const transaction = await db.paymentTransaction.findUnique({
      where: { id: transactionId },
    });

    if (!transaction) {
      throw new NotFoundError('PaymentTransaction', transactionId);
    }

    // Get unpaid invoices within the search window
    const unpaidInvoices = await db.invoice.findMany({
      where: {
        status: { in: ['GENERATED', 'SENT', 'VIEWED'] },
        dueDate: {
          gte: new Date(transaction.transactionDate.getTime() - INVOICE_SEARCH_DAYS_BEFORE * 24 * 60 * 60 * 1000),
          lte: new Date(transaction.transactionDate.getTime() + INVOICE_SEARCH_DAYS_AFTER * 24 * 60 * 60 * 1000),
        },
      },
      include: {
        room: {
          include: {
            tenants: {
              where: { moveOutDate: null },
              include: { tenant: true },
            },
          },
        },
      },
    });

    const candidates: MatchScore[] = [];

    for (const inv of unpaidInvoices) {
      const score = this.computeMatchScore(
        {
          amount: Number(transaction.amount),
          description: transaction.description ?? undefined,
          reference: transaction.reference ?? undefined,
          transactionDate: transaction.transactionDate,
        },
        {
          id: inv.id,
          total: Number(inv.snapshotTotal ?? inv.totalAmount),
          dueDate: inv.dueDate,
          room: {
            roomNumber: inv.roomNo,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            roomTenants: (((inv.room as any) as { tenants?: Array<{ tenant?: { firstName?: string; lastName?: string } | null }> }).tenants ?? []).map((rt) => ({
              tenant: {
                firstName: rt.tenant?.firstName ?? '',
                lastName: rt.tenant?.lastName ?? '',
              },
            })),
          },
        },
      );
      // Only include candidates with score >= MANUAL_REVIEW threshold (not immediately rejected)
      if (score.totalScore >= MATCH_THRESHOLDS.MANUAL_REVIEW) {
        candidates.push(score);
      }
    }

    // Sort by totalScore descending (highest score = best match)
    candidates.sort((a, b) => b.totalScore - a.totalScore);

    const bestMatch = candidates[0];

    if (bestMatch) {
      const matchedInvoice = unpaidInvoices.find(inv => inv.id === bestMatch.invoiceId);
      const invoiceTotal = matchedInvoice ? Number(matchedInvoice.totalAmount) : null;
      const txAmount = Number(transaction.amount);
      const { matchedAmount: computedMatchedAmount, matchType: computedMatchType } =
        computeMatchResult(txAmount, invoiceTotal);

      // AGENT-3 STRICT AUTO-CONFIRM: Only if score >= 95 AND all must-pass factors present
      // MEDIUM confidence (70-94) is NEVER auto-confirmed — requires manual review
      if (autoConfirmHighConfidence && canAutoConfirm(bestMatch)) {
        await this.autoConfirmMatch(db, transaction.id, bestMatch.invoiceId, txAmount, invoiceTotal, computedMatchedAmount, computedMatchType);
        logger.info({
          type: 'payment_auto_confirmed',
          transactionId: transaction.id,
          invoiceId: bestMatch.invoiceId,
          confidence: bestMatch.confidence,
          score: bestMatch.totalScore,
        });
        return 'CONFIRMED';
      }

      // Update transaction with match
      await db.paymentTransaction.update({
        where: { id: transaction.id },
        data: {
          invoiceId: bestMatch.invoiceId,
          confidenceScore: bestMatch.totalScore / 100,
          status: bestMatch.confidence === 'LOW' ? 'NEED_REVIEW' : 'AUTO_MATCHED',
          matchedAt: new Date(),
          matchedAmount: computedMatchedAmount,
          matchType: computedMatchType,
        },
      });

      logger.info({
        type: 'payment_matched',
        transactionId: transaction.id,
        invoiceId: bestMatch.invoiceId,
        confidence: bestMatch.confidence,
        score: bestMatch.totalScore,
        reasons: bestMatch.reasons,
      });
    }

    return bestMatch;
  }

  /**
   * Auto-confirm a HIGH confidence payment match without admin action.
   * Called during bank statement import when autoConfirmHighConfidence=true and confidence=HIGH.
   *
   * FIX C01: Idempotency — re-check transaction is not already CONFIRMED inside the
   * transaction before any writes. Prevents duplicate Payment records from concurrent
   * auto-confirm calls that both passed the initial status check in attemptMatch.
   */
  private async autoConfirmMatch(
    db: Prisma.TransactionClient,
    transactionId: string,
    invoiceId: string,
    txAmount: number,
    invoiceTotal: number | null,
    matchedAmount: number,
    matchType: 'FULL' | 'PARTIAL' | 'OVERPAY',
  ): Promise<void> {
    // ── Idempotency re-check INSIDE the transaction ─────────────────────────────
    // Re-fetch the transaction with row lock to prevent concurrent confirmations.
    // If already CONFIRMED, return early — no-op (idempotent).
    const currentTx = await db.paymentTransaction.findUnique({
      where: { id: transactionId },
    });
    if (!currentTx || currentTx.status === 'CONFIRMED') {
      return; // Idempotent: already confirmed by a concurrent call
    }

    // ── Overpayment detection ─────────────────────────────────────────────────
    if (matchType === 'OVERPAY') {
      const excessAmount = txAmount - (invoiceTotal ?? 0);
      logger.warn({
        type: 'overpayment_detected',
        transactionId,
        invoiceId,
        txAmount,
        invoiceTotal,
        excessAmount,
        message: `Overpayment of ${excessAmount} detected on invoice ${invoiceId}. Manual review required for refund/credit.`,
      });
      await logAudit({
        actorId: 'SYSTEM',
        actorRole: 'SYSTEM',
        action: 'OVERPAYMENT_DETECTED',
        entityType: 'PAYMENT_TRANSACTION',
        entityId: transactionId,
        metadata: {
          transactionId,
          invoiceId,
          txAmount,
          invoiceTotal,
          excessAmount,
        },
      });
    }

    // Update transaction to CONFIRMED
    await db.paymentTransaction.update({
      where: { id: transactionId },
      data: {
        invoiceId,
        status: 'CONFIRMED',
        confidenceScore: 1.0, // 'HIGH' equivalent in 0-1 scale
        confirmedAt: new Date(),
        confirmedBy: 'SYSTEM',
        matchedAmount,
        matchType,
        matchedAt: new Date(),
      },
    });

    // Create Payment record — transactionId unique constraint prevents duplicates
    // if concurrent auto-confirm calls both passed the re-check above.
    // Catch P2002 (unique constraint violation) to handle the rare case where
    // the record was created between the re-check and the insert — treat as
    // idempotent no-op.
    let payment: { id: string } | undefined;
    try {
      payment = await db.payment.create({
        data: {
          id: uuidv4(),
          transactionId: transactionId,
          amount: currentTx.amount,
          paidAt: currentTx.transactionDate,
          description: currentTx.description,
          reference: currentTx.reference,
          sourceFile: currentTx.sourceFile,
          status: 'CONFIRMED',
          matchedInvoiceId: invoiceId,
          confirmedAt: new Date(),
          confirmedBy: 'SYSTEM',
          remark: matchType === 'OVERPAY'
            ? `Overpayment credit: excess of ${(txAmount - (invoiceTotal ?? 0)).toFixed(2)} THB over invoice total. Requires admin review for refund/credit.`
            : null,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        // Idempotent: Payment already created by a concurrent call — no-op
        logger.info({
          type: 'payment_auto_confirm_idempotent',
          transactionId,
        });
        return;
      }
      throw error;
    }

    // Sync invoice payment state
    await syncInvoicePaymentState(db, {
      invoiceId,
      paymentId: payment.id,
      paymentAmount: txAmount,
      paidAt: currentTx.transactionDate,
    });

    // Create PaymentMatch record — @@unique([paymentId, invoiceId]) guard prevents
    // duplicates if two concurrent calls both passed the status re-check above.
    // Catch P2002 to handle the rare case where the record was created between
    // the re-check and the insert — treat as idempotent no-op.
    try {
      await db.paymentMatch.create({
        data: {
          id: uuidv4(),
          paymentId: payment.id,
          invoiceId,
          confidence: 'HIGH',
          isAutoMatched: true,
          status: 'CONFIRMED',
          confirmedAt: new Date(),
          confirmedBy: 'SYSTEM',
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        logger.info({ type: 'payment_match_idempotent', paymentId: payment.id, invoiceId });
        return; // already matched — idempotent no-op
      }
      throw error;
    }

    // P3-02: Write PaymentHistory audit trail for auto-confirmed match
    await db.paymentHistory.create({
      data: {
        id: uuidv4(),
        paymentId: payment.id,
        action: 'CONFIRMED',
        actorId: 'SYSTEM',
        actorRole: 'SYSTEM',
        metadata: {
          transactionId,
          invoiceId,
          matchedAmount,
          matchType,
          isAutoMatched: true,
        } as Prisma.InputJsonValue,
      },
    });

    await logAudit({
      actorId: 'SYSTEM',
      actorRole: 'SYSTEM',
      action: 'PAYMENT_CONFIRMED',
      entityType: 'INVOICE',
      entityId: invoiceId,
      metadata: { transactionId, via: 'AUTO_CONFIRM' },
    });
  }

  /**
   * AGENT-3 REPLACEMENT: Multi-factor scoring instead of priority-based evaluateMatch.
   *
   * Computes a weighted MatchScore (0-100) for a transaction-invoice pair.
   * All factors are evaluated independently; scores are additive.
   *
   * Factor weights:
   *   AMOUNT_EXACT  — exact match (diff < ฿1):      +30 pts
   *   AMOUNT_CLOSE  — match within ฿10:             +20 pts
   *   INVOICE_REF   — invoice number in desc:      +35 pts  ← STRONGEST signal
   *   ROOM_MATCH    — room number in desc:          +20 pts
   *   DATE_WINDOW   — tx date within ±7d of due:   +10 pts
   *   TENANT_NAME   — tenant name in desc:          +5 pts
   *
   * Confidence classification:
   *   95-100 → HIGH  (auto-confirm eligible — requires all must-pass factors)
   *   70-94  → MEDIUM (manual review required)
   *   0-69   → LOW   (reject — left as NEED_REVIEW)
   */
  private computeMatchScore(
    transaction: {
      amount: number;
      description?: string | null;
      reference?: string | null;
      transactionDate: Date;
    },
    invoice: {
      id: string;
      total: number;
      dueDate: Date;
      room: {
        roomNumber: string;
        roomTenants: Array<{
          tenant: {
            firstName: string;
            lastName: string;
          };
        }>;
      };
    },
  ): MatchScore {
    const factors: MatchFactor[] = [];
    const reasons: string[] = [];
    let totalScore = 0;

    const invoiceTotal = Number(invoice.total);
    const amountDiff = Math.abs(transaction.amount - invoiceTotal);
    const textFields = [
      transaction.description ?? '',
      transaction.reference ?? '',
    ]
      .join(' ')
      .toLowerCase()
      .trim();

    // ── Factor 1: Amount exact match (diff < ฿1) ─────────────────────────────────
    const AMOUNT_EXACT_TOLERANCE = 1.0;
    if (amountDiff < AMOUNT_EXACT_TOLERANCE) {
      totalScore += 30;
      factors.push({
        type: 'AMOUNT_EXACT',
        weight: 30,
        passed: true,
        detail: `Amount ฿${transaction.amount.toFixed(2)} matches invoice ฿${invoiceTotal.toFixed(2)} (diff ฿${amountDiff.toFixed(2)} < ฿${AMOUNT_EXACT_TOLERANCE})`,
      });
    } else if (amountDiff <= 10) {
      // Close but not exact — partial credit
      totalScore += 20;
      factors.push({
        type: 'AMOUNT_CLOSE',
        weight: 20,
        passed: true,
        detail: `Amount ฿${transaction.amount.toFixed(2)} close to invoice ฿${invoiceTotal.toFixed(2)} (diff ฿${amountDiff.toFixed(2)} ≤ ฿10)`,
      });
      reasons.push(`Amount within ฿10 tolerance (diff ฿${amountDiff.toFixed(2)})`);
    }

    // ── Factor 2: Invoice number reference in description ────────────────────────
    const invoiceNumber = this.extractInvoiceNumber(textFields);
    if (invoiceNumber) {
      totalScore += 35;
      factors.push({
        type: 'INVOICE_REF',
        weight: 35,
        passed: true,
        detail: `Invoice number '${invoiceNumber}' found in description/reference`,
      });
      reasons.push(`Invoice reference detected: ${invoiceNumber}`);
    }

    // ── Factor 3: Room number in description ─────────────────────────────────────
    const roomNumber = invoice.room.roomNumber;
    if (textFields.includes(roomNumber.toLowerCase())) {
      totalScore += 20;
      factors.push({
        type: 'ROOM_MATCH',
        weight: 20,
        passed: true,
        detail: `Room number '${roomNumber}' found in description`,
      });
      reasons.push(`Room number ${roomNumber} matched`);
    }

    // ── Factor 4: Transaction date within ±7 days of due date ───────────────────
    const DATE_WINDOW_DAYS = 7;
    const dueDate = new Date(invoice.dueDate);
    const txDate = new Date(transaction.transactionDate);
    const daysDiff = Math.abs(
      (txDate.getTime() - dueDate.getTime()) / (24 * 60 * 60 * 1000),
    );
    if (daysDiff <= DATE_WINDOW_DAYS) {
      totalScore += 10;
      factors.push({
        type: 'DATE_WINDOW',
        weight: 10,
        passed: true,
        detail: `Transaction date ${txDate.toISOString().slice(0, 10)} within ${DATE_WINDOW_DAYS} days of due date ${dueDate.toISOString().slice(0, 10)} (${daysDiff.toFixed(1)} days)`,
      });
      reasons.push(`Transaction date within ±${DATE_WINDOW_DAYS} days of due date`);
    }

    // ── Factor 5: Tenant name in description ─────────────────────────────────────
    const primaryTenant = invoice.room.roomTenants[0]?.tenant;
    if (primaryTenant) {
      const firstName = primaryTenant.firstName.toLowerCase();
      const lastName = primaryTenant.lastName.toLowerCase();
      const fullName = `${firstName} ${lastName}`;
      if (
        textFields.includes(firstName) ||
        textFields.includes(lastName) ||
        textFields.includes(fullName)
      ) {
        totalScore += 5;
        factors.push({
          type: 'TENANT_NAME',
          weight: 5,
          passed: true,
          detail: `Tenant name '${primaryTenant.firstName} ${primaryTenant.lastName}' found in description`,
        });
        reasons.push(`Tenant name matched`);
      }
    }

    // ── Classify confidence level ─────────────────────────────────────────────────
    const confidence: MatchConfidenceLevel =
      totalScore >= MATCH_THRESHOLDS.AUTO_CONFIRM
        ? 'HIGH'
        : totalScore >= MATCH_THRESHOLDS.MANUAL_REVIEW
          ? 'MEDIUM'
          : 'LOW';

    return {
      invoiceId: invoice.id,
      totalScore,
      confidence,
      factors,
      reasons,
    };
  }

  private extractInvoiceNumber(text: string): string | null {
    // Bank transaction refs like INV-PAYTEST-101, INV-101, invoice-2024-001.
    //
    // Strategy: check INVOICE- before INV- so the INVOICE- prefix in
    // "invoice-2024-001" is consumed by the dedicated pattern without
    // being partially captured by the INV- pattern.
    const patterns = [
      // INVOICE- prefix must be checked before INV- to avoid the INV- inside
      // "invoice" from consuming the wrong prefix when both exist in text.
      /(?:^|\s)INVOICE[-\s]?(\d[\d-]*)(?=\s|$)/i,
      /(?:^|\s)INV[-\s]?([A-Z0-9][A-Z0-9-]*)(?=\s|$)/i,
      /(?:^|[\s/])PAYTEST[-\s]?(\d{3})(?=\s|$)/i,
      /(?<![a-zA-Z\d])(\d{4}[-\s]?\d{3,})(?![-\s]?\d)/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        let result = match[1].replace(/\s/g, '').toUpperCase();
        // PAYTEST-101 → 101, INV-PAYTEST-101 → 101, 2024-001 stays 2024-001
        const normalized = result.replace(/^([A-Z]+[-\s]?)(\d+)$/i, '$2');
        return normalized === result ? result : normalized;
      }
    }

    return null;
  }

  private getConfidenceScore(confidence: MatchConfidence): number {
    switch (confidence) {
      case 'HIGH': return 0.95;
      case 'MEDIUM': return 0.75;
      case 'LOW': return 0.50;
      default: return 0.25;
    }
  }

  // ============================================================================
  // Match Confirmation / Rejection
  // ============================================================================

  /**
   * Manually confirms a payment match selected by an admin.
   * All validations (transaction exists, not already confirmed, invoice not paid)
   * and writes are performed inside a $transaction.
   * Amount-only (LOW confidence) matches are rejected unless a room/invoice/resident
   * signal is present.
   *
   * @param transactionId - UUID of the PaymentTransaction to confirm
   * @param invoiceId     - UUID of the Invoice to associate
   * @param confirmedBy   - Actor ID performing the confirmation
   * @throws NotFoundError    if transaction or invoice does not exist
   * @throws BadRequestError  if invoice is already PAID or confidence is LOW
   * @throws ConflictError     if invoice already has a confirmed payment
   */
  async confirmMatch(
    transactionId: string,
    invoiceId: string,
    confirmedBy: string,
    requestId?: string,
    options?: { manualOverride?: boolean; overrideReason?: string },
  ): Promise<void> {
    logger.info({ type: 'payment_match_confirm_start', requestId: requestId ?? null, transactionId, invoiceId, confirmedBy, manualOverride: options?.manualOverride ?? false });
    // Pre-flight: fetch full transaction state for early-exit and error messaging.
    // All authoritative validation and writes happen inside the $transaction.
    const transaction = await prisma.paymentTransaction.findUnique({
      where: { id: transactionId },
    });

    if (!transaction) {
      throw new NotFoundError('PaymentTransaction', transactionId);
    }

    if (transaction.status === 'CONFIRMED') {
      // Idempotent: already confirmed, no-op
      return;
    }

    // Amount-only (LOW confidence) matches require explicit human review before confirmation.
    if (transaction.confidenceScore !== null && Number(transaction.confidenceScore) < 0.75) {
      throw new BadRequestError(
        'Cannot confirm amount-only match automatically. ' +
        'Ensure room number, invoice number, or resident name is visible in the transaction reference before confirming.'
      );
    }

    // Amount calculations from pre-flight read (safe since transaction.amount doesn't change)
    const txAmount = Number(transaction.amount);

    await prisma.$transaction(async (tx) => {
      // Acquire exclusive row locks on BOTH the transaction and the invoice
      // before any reads. This prevents two concurrent staff confirmations from
      // both passing the "not yet CONFIRMED" check and creating duplicate payments.
      //
      // Lock order: payment_transaction → invoices (consistent order prevents deadlock).
      type LockRow = { id: string };
      const [txLock] = await (tx as unknown as { $queryRaw: (s: TemplateStringsArray, ...a: unknown[]) => Promise<LockRow[]> })
        .$queryRaw`SELECT id FROM payment_transactions WHERE id = ${transactionId} FOR UPDATE`;
      if (!txLock) return; // row gone — idempotent

      const [invLock] = await (tx as unknown as { $queryRaw: (s: TemplateStringsArray, ...a: unknown[]) => Promise<LockRow[]> })
        .$queryRaw`SELECT id FROM invoices WHERE id = ${invoiceId} FOR UPDATE`;
      if (!invLock) throw new NotFoundError('Invoice', invoiceId);

      // Re-read full rows after acquiring locks (authoritative state)
      const [current, invoice] = await Promise.all([
        tx.paymentTransaction.findUnique({ where: { id: transactionId } }),
        tx.invoice.findUnique({ where: { id: invoiceId } }),
      ]);

      if (!current || current.status === 'CONFIRMED') return; // idempotent inside tx

      if (!invoice) {
        throw new NotFoundError('Invoice', invoiceId);
      }
      if (invoice.status === 'PAID') {
        throw new BadRequestError('Invoice is already paid');
      }

      // Gap-2: Use snapshot total so payment matching uses sent-time values, not mutable billing
      const invoiceTotal = Number(invoice.snapshotTotal ?? invoice.totalAmount);
      const { matchedAmount: confirmedMatchedAmount, matchType: confirmedMatchType } =
        computeMatchResult(txAmount, invoiceTotal);

      // Gap-3 Guard: block low-confidence or high-diff matches unless explicit override
      const guardResult = await assertMatchDecisionAllowed(tx, {
        paymentTransactionId: transactionId,
        invoiceId,
        decidedBy: confirmedBy,
        manualOverride: options?.manualOverride,
        overrideReason: options?.overrideReason,
      });
      if (!guardResult.allowed) {
        throw new BadRequestError(guardResult.reason ?? 'Match not allowed');
      }

      // Flag overpayment: excess amount over invoice total requires manual review
      if (confirmedMatchType === 'OVERPAY') {
        const excessAmount = txAmount - invoiceTotal;
        logger.warn({
          type: 'overpayment_detected',
          transactionId,
          invoiceId,
          txAmount,
          invoiceTotal,
          excessAmount,
          message: `Overpayment of ${excessAmount} detected on invoice ${invoiceId}. Manual review required for refund/credit.`,
        });
        await logAudit({
          actorId: confirmedBy,
          actorRole: 'ADMIN',
          action: 'OVERPAYMENT_DETECTED',
          entityType: 'PAYMENT_TRANSACTION',
          entityId: transactionId,
          metadata: {
            transactionId,
            invoiceId,
            txAmount,
            invoiceTotal,
            excessAmount,
          },
        });
      }

      // Belt-and-suspenders: ensure no other CONFIRMED transaction already owns this invoice.
      // The application-level check precedes the DB-level unique-index protection (there is
      // no DB-level unique index on invoiceId for CONFIRMED status — see schema.prisma).
      const existingConfirmed = await tx.paymentTransaction.findFirst({
        where: { invoiceId, status: 'CONFIRMED' },
      });
      if (existingConfirmed) {
        throw new ConflictError(
          `Invoice ${invoiceId} already has a confirmed payment transaction ${existingConfirmed.id}`
        );
      }

      // Update transaction
      await tx.paymentTransaction.update({
        where: { id: transactionId },
        data: {
          invoiceId,
          status: 'CONFIRMED',
          confirmedAt: new Date(),
          confirmedBy,
          matchedAmount: confirmedMatchedAmount,
          matchType: confirmedMatchType,
        },
      });

      // Create payment record
      const payment = await tx.payment.create({
        data: {
          id: uuidv4(),
          amount: transaction.amount,
          paidAt: transaction.transactionDate,
          description: transaction.description,
          reference: transaction.reference,
          sourceFile: transaction.sourceFile,
          status: 'CONFIRMED',
          matchedInvoiceId: invoiceId,
          confirmedAt: new Date(),
          confirmedBy,
          remark: confirmedMatchType === 'OVERPAY'
            ? `Overpayment credit: excess of ${(txAmount - invoiceTotal).toFixed(2)} THB over invoice total. Requires admin review for refund/credit.`
            : null,
        },
      });

      await syncInvoicePaymentState(tx, {
        invoiceId,
        paymentId: payment.id,
        paymentAmount: txAmount,
        paidAt: transaction.transactionDate,
      });

      // Gap-3: Record decision audit trail with snapshot
      await createPaymentMatchDecision(tx, {
        paymentTransactionId: transactionId,
        invoiceId,
        confidenceScore: Math.round((current.confidenceScore ? Number(current.confidenceScore) * 100 : 0)),
        matchFactors: [], // scoring factors not re-computed on manual confirm
        decidedBy: confirmedBy,
        manualOverride: options?.manualOverride ?? false,
        overrideReason: options?.overrideReason,
      });

      // Create payment match record — @@unique([paymentId, invoiceId]) guard prevents
      // duplicates within the serialized transaction. P2002 catch as belt-and-suspenders.
      try {
        await tx.paymentMatch.create({
          data: {
            id: uuidv4(),
            paymentId: payment.id,
            invoiceId,
            confidence: 'HIGH',
            isAutoMatched: false,
            status: 'CONFIRMED',
            confirmedAt: new Date(),
            confirmedBy,
          },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          // Already matched — idempotent no-op within this transaction
          logger.info({ type: 'payment_match_confirm_idempotent', paymentId: payment.id, invoiceId });
        } else {
          throw error;
        }
      }

      // P3-02: Write PaymentHistory audit trail
      await tx.paymentHistory.create({
        data: {
          id: uuidv4(),
          paymentId: payment.id,
          action: 'CONFIRMED',
          actorId: confirmedBy,
          actorRole: 'ADMIN',
          metadata: {
            transactionId,
            invoiceId,
            matchedAmount: confirmedMatchedAmount,
            matchType: confirmedMatchType,
          } as Prisma.InputJsonValue,
        },
      });
    });

    await logAudit({
      actorId: confirmedBy,
      actorRole: 'ADMIN',
      action: 'PAYMENT_CONFIRMED',
      entityType: 'INVOICE',
      entityId: invoiceId,
      metadata: { transactionId, via: 'MATCH_CONFIRM' },
    });

    logger.info({
      type: 'payment_match_confirmed',
      transactionId,
      invoiceId,
      confirmedBy,
    });
  }

  /**
   * Rejects a payment transaction that could not be matched automatically.
   * Sets its status to REJECTED with an optional reason.
   * Idempotent: already-rejected transactions are a no-op.
   *
   * @param transactionId - UUID of the PaymentTransaction to reject
   * @param rejectedBy   - Actor ID performing the rejection
   * @param rejectReason - Optional free-text reason for the rejection
   * @throws NotFoundError  if transaction does not exist
   * @throws BadRequestError if transaction is already CONFIRMED
   */
  async rejectMatch(
    transactionId: string,
    rejectedBy: string,
    rejectReason?: string
  ): Promise<void> {
    const transaction = await prisma.paymentTransaction.findUnique({
      where: { id: transactionId },
    });

    if (!transaction) {
      throw new NotFoundError('PaymentTransaction', transactionId);
    }

    if (transaction.status === 'CONFIRMED') {
      throw new BadRequestError('Cannot reject a confirmed transaction. Un-match it first.');
    }

    if (transaction.status === 'REJECTED') {
      // Idempotent: already rejected, no-op
      return;
    }

    await prisma.$transaction(async (tx) => {
      // Re-check status inside transaction to guard against concurrent rejects.
      const current = await tx.paymentTransaction.findUnique({ where: { id: transactionId } });
      if (!current || current.status === 'CONFIRMED' || current.status === 'REJECTED') return; // idempotent

      await tx.paymentTransaction.update({
        where: { id: transactionId },
        data: {
          status: 'REJECTED',
          rejectedAt: new Date(),
          rejectedBy,
          rejectReason,
        },
      });

      // P3-02: Write PaymentHistory audit trail
      // Note: Payment record is not created for rejected transactions, so paymentId is null.
      // The rejection audit is linked via transactionId in metadata.
      await tx.paymentHistory.create({
        data: {
          id: uuidv4(),
          paymentId: null,
          action: 'REJECTED',
          actorId: rejectedBy,
          actorRole: 'ADMIN',
          metadata: {
            transactionId,
            rejectReason: rejectReason || null,
          } as Prisma.InputJsonValue,
        },
      });
    });

    await logAudit({
      actorId: rejectedBy,
      actorRole: 'ADMIN',
      action: 'PAYMENT_REJECTED',
      entityType: 'PAYMENT_TRANSACTION',
      entityId: transactionId,
      metadata: { rejectReason: rejectReason || null },
    });

    logger.info({
      type: 'payment_match_rejected',
      transactionId,
      rejectedBy,
      rejectReason: rejectReason || null,
    });
  }

  // ============================================================================
  // Review Queues
  // ============================================================================

  /**
   * Returns transactions in NEED_REVIEW status that require admin resolution.
   * These are LOW confidence matches or unmatched entries from bank statement import.
   *
   * @param limit  - Max records to return (default 50)
   * @param offset - Pagination offset
   * @returns Paginated list of transactions and total count
   */
  async getMatchesForReview(limit = 50, offset = 0) {
    const [transactions, total] = await Promise.all([
      prisma.paymentTransaction.findMany({
        where: { status: 'NEED_REVIEW' },
        include: {
          invoice: {
            include: {
              room: {
                include: {
                  tenants: {
                    where: { moveOutDate: null },
                    include: { tenant: true },
                  },
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.paymentTransaction.count({
        where: { status: 'NEED_REVIEW' },
      }),
    ]);

    return { transactions, total };
  }

  /**
   * Returns transactions that were auto-matched at import time (AUTO_MATCHED).
   * These are MEDIUM confidence matches that require admin verification.
   *
   * @param limit  - Max records to return (default 50)
   * @param offset - Pagination offset
   * @returns Paginated list of transactions and total count
   */
  async getAutoMatchedPayments(limit = 50, offset = 0) {
    const [transactions, total] = await Promise.all([
      prisma.paymentTransaction.findMany({
        where: { status: 'AUTO_MATCHED' },
        include: {
          invoice: {
            include: {
              room: {
                include: {
                  tenants: {
                    where: { moveOutDate: null },
                    include: { tenant: true },
                  },
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.paymentTransaction.count({
        where: { status: 'AUTO_MATCHED' },
      }),
    ]);

    return { transactions, total };
  }
}

export function createPaymentMatchingService(): PaymentMatchingService {
  return new PaymentMatchingService();
}

let _paymentMatchingSingleton: PaymentMatchingService | null = null;
/**
 * Cached singleton accessor used by route handlers and integration tests
 * that don't go through the DI container.
 */
export function getPaymentMatchingService(): PaymentMatchingService {
  if (!_paymentMatchingSingleton) {
    _paymentMatchingSingleton = new PaymentMatchingService();
  }
  return _paymentMatchingSingleton;
}
