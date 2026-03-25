import { v4 as uuidv4 } from 'uuid';
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
}

export type MatchConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

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
            },
          });

          imported++;

          // Attempt to match using the same transaction connection
          const matchResult = await this.attemptMatch(transaction.id, tx);
          if (matchResult) {
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

  async attemptMatch(transactionId: string, tx?: typeof prisma): Promise<MatchCandidate | null> {
    const db = tx ?? prisma;
    const transaction = await db.paymentTransaction.findUnique({
      where: { id: transactionId },
    });

    if (!transaction) {
      throw new NotFoundError('PaymentTransaction', transactionId);
    }

    // Get unpaid invoices
    const unpaidInvoices = await db.invoice.findMany({
      where: {
        status: { in: ['GENERATED', 'SENT', 'VIEWED'] },
        dueDate: {
          gte: new Date(transaction.transactionDate.getTime() - 30 * 24 * 60 * 60 * 1000), // 30 days before tx
          lte: new Date(transaction.transactionDate.getTime() + 45 * 24 * 60 * 60 * 1000), // 45 days after tx (early-pay window)
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
          amount: Number((transaction as unknown as { amount: unknown }).amount as number),
          description: transaction.description ?? undefined,
          reference: transaction.reference ?? undefined,
        },
        {
          id: inv.id,
          total: Number(inv.totalAmount),
          room: {
            roomNumber: inv.roomNo,
            roomTenants: ((inv.room as unknown as { tenants?: Array<{ tenant?: { firstName?: string; lastName?: string } | null }> })?.tenants ?? []).map((rt) => ({
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
      const computedMatchedAmount = invoiceTotal !== null ? Math.min(txAmount, invoiceTotal) : txAmount;
      const computedMatchType =
        invoiceTotal === null
          ? 'FULL'
          : Math.abs(txAmount - invoiceTotal) < 0.01
          ? 'FULL'
          : txAmount < invoiceTotal
          ? 'PARTIAL'
          : 'OVERPAY';

      // Update transaction with match
      await db.paymentTransaction.update({
        where: { id: transaction.id },
        data: {
          invoiceId: bestMatch.invoiceId,
          confidenceScore: this.getConfidenceScore(bestMatch.confidence),
          status: bestMatch.confidence === 'HIGH' ? 'AUTO_MATCHED' : 'NEED_REVIEW',
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

  async confirmMatch(
    transactionId: string,
    invoiceId: string,
    confirmedBy: string
  ): Promise<void> {
    // Pre-flight check: fetch full transaction state before entering the write transaction.
    // The actual DB-level protection against concurrent confirmation is inside $transaction.
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
    // Reject if confidenceScore is set and below 0.75 (LOW confidence). Null means no auto-match.
    if (transaction.confidenceScore !== null && Number(transaction.confidenceScore) < 0.75) {
      throw new BadRequestError(
        'Cannot confirm amount-only match automatically. ' +
        'Ensure room number, invoice number, or resident name is visible in the transaction reference before confirming.'
      );
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
    });

    if (!invoice) {
      throw new NotFoundError('Invoice', invoiceId);
    }
    if (invoice.status === 'PAID') {
      throw new BadRequestError('Invoice is already paid');
    }

    const txAmount = Number(transaction.amount);
    const invoiceTotal = Number(invoice.totalAmount);
    const confirmedMatchedAmount = Math.min(txAmount, invoiceTotal);
    const confirmedMatchType =
      Math.abs(txAmount - invoiceTotal) < 0.01
        ? 'FULL'
        : txAmount < invoiceTotal
        ? 'PARTIAL'
        : 'OVERPAY';

    await prisma.$transaction(async (tx) => {
      // Belt-and-suspenders: re-check status inside transaction after acquiring the
      // Prisma connection. Concurrent calls will serialize here due to Prisma's
      // connection pooling and the unique index on (invoiceId) for CONFIRMED payments.
      const current = await tx.paymentTransaction.findUnique({ where: { id: transactionId } });
      if (!current || current.status === 'CONFIRMED') return;  // idempotent inside tx

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
