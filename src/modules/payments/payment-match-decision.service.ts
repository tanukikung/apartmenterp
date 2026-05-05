import { Prisma } from '@prisma/client';
import { BadRequestError } from '@/lib/utils/errors';

export interface MatchFactor {
  type: 'AMOUNT_EXACT' | 'AMOUNT_CLOSE' | 'ROOM_MATCH' | 'INVOICE_REF' | 'DATE_WINDOW' | 'TENANT_NAME';
  passed: boolean;
  weight: number;
  detail: string;
}

export interface AssertMatchAllowedResult {
  allowed: boolean;
  reason?: string;
  diff?: number;
  confidenceScore?: number;
}

/**
 * Creates a PaymentMatchDecision record with audit snapshots at decision time.
 */
export async function createPaymentMatchDecision(
  tx: Prisma.TransactionClient,
  params: {
    paymentTransactionId: string;
    invoiceId: string;
    confidenceScore: number;
    matchFactors: MatchFactor[];
    decidedBy: string;
    manualOverride?: boolean;
    overrideReason?: string;
  }
): Promise<void> {
  const [txRecord, invoice] = await Promise.all([
    tx.paymentTransaction.findUnique({ where: { id: params.paymentTransactionId } }),
    tx.invoice.findUnique({ where: { id: params.invoiceId } }),
  ]);

  await tx.paymentMatchDecision.create({
    data: {
      paymentTransactionId: params.paymentTransactionId,
      invoiceId: params.invoiceId,
      confidenceScore: params.confidenceScore,
      matchFactors: params.matchFactors as unknown as Prisma.InputJsonValue,
      manualOverride: params.manualOverride ?? false,
      overrideReason: params.overrideReason,
      decidedBy: params.decidedBy,
      transactionSnapshot: txRecord
        ? ({
            amount: Number(txRecord.amount),
            description: txRecord.description,
            roomNo: txRecord.roomNo,
          } as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      invoiceSnapshot: invoice
        ? ({
            roomNo: invoice.roomNo,
            totalAmount: Number(invoice.totalAmount),
            status: invoice.status,
          } as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull,
    },
  });
}

/**
 * Guard: blocks confirmation if match is low-confidence or amount diff is large,
 * unless the admin explicitly overrides with a valid reason.
 *
 * @returns { allowed: false, reason, diff } if blocked
 * @throws BadRequestError if override reason is too short
 */
export async function assertMatchDecisionAllowed(
  tx: Prisma.TransactionClient,
  params: {
    paymentTransactionId: string;
    invoiceId: string;
    decidedBy: string;
    manualOverride?: boolean;
    overrideReason?: string;
  }
): Promise<AssertMatchAllowedResult> {
  const [txRecord, invoice] = await Promise.all([
    tx.paymentTransaction.findUnique({ where: { id: params.paymentTransactionId } }),
    tx.invoice.findUnique({ where: { id: params.invoiceId } }),
  ]);

  if (!txRecord || !invoice) {
    return { allowed: false, reason: 'Transaction or invoice not found' };
  }

  const txAmount = Number(txRecord.amount);
  const invoiceTotal = Number(invoice.totalAmount);
  const diff = Math.abs(txAmount - invoiceTotal);

  // Retrieve stored confidence score (stored as Decimal 0-1 scale in PaymentTransaction)
  const confidenceScore = txRecord.confidenceScore !== null
    ? Number(txRecord.confidenceScore) * 100
    : 0;

  // Threshold: confidence < 70 → low confidence match
  // Diff > 50 THB → significant amount mismatch
  const isLowConfidence = confidenceScore < 70;
  const isLargeDiff = diff > 50;

  if (!isLowConfidence && !isLargeDiff) {
    return { allowed: true, diff };
  }

  // Low-confidence or large-diff: require explicit manual override with reason
  if (!params.manualOverride) {
    const reason = isLowConfidence
      ? `Low confidence match (score ${confidenceScore.toFixed(0)}/100). Manual override required.`
      : `Amount difference ฿${diff.toFixed(2)} exceeds ฿50 threshold. Manual override required.`;
    return { allowed: false, reason, diff, confidenceScore };
  }

  // Override provided — validate reason length
  if (!params.overrideReason || params.overrideReason.trim().length < 10) {
    throw new BadRequestError(
      'Override reason must be at least 10 characters when confirming a low-confidence or high-diff match.'
    );
  }

  return { allowed: true, diff };
}