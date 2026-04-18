import { v4 as uuidv4 } from 'uuid';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib';
import { logger } from '@/lib/utils/logger';
import { logAudit } from '@/modules/audit';
import { BadRequestError, ConflictError, NotFoundError } from '@/lib/utils/errors';
import { syncInvoicePaymentState } from './invoice-payment-state';

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
    let imported = 0;
    let matched = 0;

    for (const entry of entries) {
      try {
        await prisma.$transaction(async (tx) => {
          // Create payment transaction
          const transaction = await tx.paymentTransaction.create({
            data: {
              id: uuidv4(),
              amount: entry.amount,
              transactionDate: entry.date,
              description: entry.description,
              reference: entry.reference,
              sourceFile,
              status: 'PENDING',
              // Normalize empty/undefined roomNo to null so the dedup unique constraint
              // treats multiple missing-roomNo entries as non-duplicates (SQL NULL != NULL).
              roomNo: entry.roomNo || null,
            },
          });

          imported++;

          // Attempt to match using the same transaction connection
          // autoConfirmHighConfidence=true: auto-confirm HIGH confidence matches immediately
          const matchResult = await this.attemptMatch(transaction.id, tx as Prisma.TransactionClient, { autoConfirmHighConfidence: true });
          if (matchResult === 'CONFIRMED') {
            matched++;
          } else if (matchResult) {
            // MEDIUM/LOW confidence — stays as NEED_REVIEW for admin review
            matched++;
          } else {
            // No match found — move to NEED_REVIEW so admins can manually assign
            await tx.paymentTransaction.update({
              where: { id: transaction.id },
              data: { status: 'NEED_REVIEW' },
            });
          }
        }); // transaction auto-rolls back on any unhandled exception
      } catch (error) {
        logger.error({
          type: 'payment_import_entry_failed',
          entry,
          error: error instanceof Error ? error.message : String(error),
        });
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
  ): Promise<MatchCandidate | 'CONFIRMED' | null> {
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

    const candidates: MatchCandidate[] = [];

    for (const inv of unpaidInvoices) {
      const candidate = this.evaluateMatch(
        {
          amount: Number((transaction as any as { amount: unknown }).amount as number),
          description: transaction.description ?? undefined,
          reference: transaction.reference ?? undefined,
        },
        {
          id: inv.id,
          total: Number(inv.totalAmount),
          room: {
            roomNumber: inv.roomNo,
            roomTenants: ((inv.room as any as { tenants?: Array<{ tenant?: { firstName?: string; lastName?: string } | null }> })?.tenants ?? []).map((rt) => ({
              tenant: {
                firstName: rt.tenant?.firstName ?? '',
                lastName: rt.tenant?.lastName ?? '',
              },
            })),
          },
        }
      );
      if (candidate) {
        candidates.push(candidate);
      }
    }

    // Sort by confidence (HIGH -> MEDIUM -> LOW)
    candidates.sort((a, b) => {
      const confidenceOrder = { HIGH: 3, MEDIUM: 2, LOW: 1 };
      return confidenceOrder[b.confidence] - confidenceOrder[a.confidence];
    });

    const bestMatch = candidates[0];

    if (bestMatch) {
      const matchedInvoice = unpaidInvoices.find(inv => inv.id === bestMatch.invoiceId);
      const invoiceTotal = matchedInvoice ? Number(matchedInvoice.totalAmount) : null;
      const txAmount = Number(transaction.amount);
      const { matchedAmount: computedMatchedAmount, matchType: computedMatchType } =
        computeMatchResult(txAmount, invoiceTotal);

      // Auto-confirm HIGH confidence matches when autoConfirmHighConfidence is true
      if (autoConfirmHighConfidence && bestMatch.confidence === 'HIGH') {
        await this.autoConfirmMatch(db, transaction.id, bestMatch.invoiceId, txAmount, invoiceTotal, computedMatchedAmount, computedMatchType);
        logger.info({
          type: 'payment_auto_confirmed',
          transactionId: transaction.id,
          invoiceId: bestMatch.invoiceId,
          confidence: bestMatch.confidence,
        });
        return 'CONFIRMED';
      }

      // Update transaction with match
      await db.paymentTransaction.update({
        where: { id: transaction.id },
        data: {
          invoiceId: bestMatch.invoiceId,
          confidenceScore: this.getConfidenceScore(bestMatch.confidence),
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
        criteria: bestMatch.criteria,
      });
    }

    return bestMatch;
  }

  /**
   * Auto-confirm a HIGH confidence payment match without admin action.
   * Called during bank statement import when autoConfirmHighConfidence=true and confidence=HIGH.
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
    // Flag overpayment: excess amount over invoice total requires manual review
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
        confidenceScore: this.getConfidenceScore('HIGH'),
        confirmedAt: new Date(),
        confirmedBy: 'SYSTEM',
        matchedAmount,
        matchType,
        matchedAt: new Date(),
      },
    });

    // Create Payment record
    const transaction = await db.paymentTransaction.findUnique({ where: { id: transactionId } });
    const payment = await db.payment.create({
      data: {
        id: uuidv4(),
        amount: transaction!.amount,
        paidAt: transaction!.transactionDate,
        description: transaction!.description,
        reference: transaction!.reference,
        sourceFile: transaction!.sourceFile,
        status: 'CONFIRMED',
        matchedInvoiceId: invoiceId,
        confirmedAt: new Date(),
        confirmedBy: 'SYSTEM',
        remark: matchType === 'OVERPAY'
          ? `Overpayment credit: excess of ${(txAmount - (invoiceTotal ?? 0)).toFixed(2)} THB over invoice total. Requires admin review for refund/credit.`
          : null,
      },
    });

    // Sync invoice payment state
    await syncInvoicePaymentState(db, {
      invoiceId,
      paymentId: payment.id,
      paymentAmount: txAmount,
      paidAt: transaction!.transactionDate,
    });

    // Create PaymentMatch record
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

    await logAudit({
      actorId: 'SYSTEM',
      actorRole: 'SYSTEM',
      action: 'PAYMENT_CONFIRMED',
      entityType: 'INVOICE',
      entityId: invoiceId,
      metadata: { transactionId, via: 'AUTO_CONFIRM' },
    });
  }

  private evaluateMatch(
    transaction: {
      amount: number;
      description?: string | null;
      reference?: string | null;
    },
    invoice: {
      id: string;
      total: number;
      room: {
        roomNumber: string;
        roomTenants: Array<{
          tenant: {
            firstName: string;
            lastName: string;
          };
        }>;
      };
    }
  ): MatchCandidate | null {
    const invoiceTotal = Number(invoice.total);
    const amountDiff = Math.abs(transaction.amount - invoiceTotal);
    const amountMatch = amountDiff < 0.01; // Allow for small rounding differences

    if (!amountMatch) {
      return null;
    }

    // Priority 1: Invoice number in reference/description
    if (transaction.reference || transaction.description) {
      const text = `${transaction.reference || ''} ${transaction.description || ''}`.toLowerCase();
      const invoiceNumber = this.extractInvoiceNumber(text);
      if (invoiceNumber) {
        // Try to find invoice by number pattern
        return {
          invoiceId: invoice.id,
          confidence: 'HIGH',
          criteria: {
            type: 'invoice_number',
            matchedField: 'reference/description',
            expectedValue: invoiceNumber,
            actualValue: text,
          },
        };
      }
    }

    // Priority 2: Reference code match
    if (transaction.reference) {
      return {
        invoiceId: invoice.id,
        confidence: 'MEDIUM',
        criteria: {
          type: 'reference',
          matchedField: 'reference',
          expectedValue: transaction.reference,
          actualValue: transaction.reference,
        },
      };
    }

    // Priority 3: Amount + Room number
    const roomNumber = invoice.room.roomNumber;
    const textFields = [transaction.description, transaction.reference].filter(Boolean).join(' ').toLowerCase();
    if (textFields.includes(roomNumber.toLowerCase())) {
      return {
        invoiceId: invoice.id,
        confidence: 'MEDIUM',
        criteria: {
          type: 'amount_room',
          matchedField: 'description/reference',
          expectedValue: roomNumber,
          actualValue: textFields,
        },
      };
    }

    // Priority 4: Amount + Resident name
    const primaryTenant = invoice.room.roomTenants[0]?.tenant;
    if (primaryTenant) {
      const tenantName = `${primaryTenant.firstName} ${primaryTenant.lastName}`.toLowerCase();
      if (textFields.includes(primaryTenant.firstName.toLowerCase()) ||
          textFields.includes(primaryTenant.lastName.toLowerCase())) {
        return {
          invoiceId: invoice.id,
          confidence: 'LOW',
          criteria: {
            type: 'amount_resident',
            matchedField: 'description/reference',
            expectedValue: tenantName,
            actualValue: textFields,
          },
        };
      }
    }

    // Amount-only match with no supporting room/invoice/resident evidence: require human review
    // Label honestly so reviewers know this is unverified
    return {
      invoiceId: invoice.id,
      confidence: 'LOW',
      criteria: {
        type: 'amount_only',
        matchedField: 'amount',
        expectedValue: invoiceTotal.toString(),
        actualValue: transaction.amount.toString(),
        warning: 'No room number, invoice number, or resident name detected',
      },
    };
  }

  private extractInvoiceNumber(text: string): string | null {
    // Look for patterns like INV-2024-001, 2024-001, etc.
    const patterns = [
      /INV[-\s]?(\d{4}[-\s]?\d{3,})/i,
      /(?:invoice|inv)[-\s]?(\d{4}[-\s]?\d{3,})/i,
      /(\d{4}[-\s]?\d{3,})/,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1].replace(/\s/g, '');
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
    confirmedBy: string
  ): Promise<void> {
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
      // All authoritative checks inside the transaction
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

      const invoiceTotal = Number(invoice.totalAmount);
      const { matchedAmount: confirmedMatchedAmount, matchType: confirmedMatchType } =
        computeMatchResult(txAmount, invoiceTotal);

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

      // Create payment match record
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
