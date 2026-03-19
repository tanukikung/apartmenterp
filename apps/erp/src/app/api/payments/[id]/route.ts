import { NextRequest, NextResponse } from 'next/server';
import { asyncHandler, type ApiResponse, NotFoundError } from '@/lib/utils/errors';
import { prisma } from '@/lib';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// GET /api/payments/[id]
// Returns a single PaymentTransaction (or falls back to Payment) by ID.
// The admin payment detail page expects the PaymentTransaction model fields
// because the payments list is fed from the review/matched queues which use
// PaymentTransaction records. Field names are mapped to match the client type.
// ---------------------------------------------------------------------------

export const GET = asyncHandler(
  async (
    _req: NextRequest,
    { params }: { params: { id: string } },
  ): Promise<NextResponse> => {
    const { id } = params;

    // ── Try PaymentTransaction first (the model used by the review queue) ──
    const tx = await prisma.paymentTransaction.findUnique({
      where: { id },
      include: {
        invoice: {
          select: {
            id: true,
            totalAmount: true,
            year: true,
            month: true,
            status: true,
            room: { select: { roomNo: true } },
          },
        },
        bankAccount: {
          select: { bankAccountNo: true, bankName: true },
        },
      },
    });

    if (tx) {
      const data = {
        id: tx.id,
        amount: Number(tx.amount),
        paymentDate: tx.transactionDate.toISOString(),
        referenceNumber: tx.reference ?? null,
        bankAccount: tx.bankAccount
          ? `${tx.bankAccount.bankName ?? ''} ${tx.bankAccount.bankAccountNo ?? ''}`.trim() || null
          : null,
        status: tx.status, // PaymentTransactionStatus: PENDING | AUTO_MATCHED | NEED_REVIEW | CONFIRMED | REJECTED
        matchType: tx.matchType ?? null, // FULL | PARTIAL | OVERPAY | UNDERPAY
        matchedAmount: tx.matchedAmount != null ? Number(tx.matchedAmount) : null,
        invoiceId: tx.invoiceId ?? null,
        createdAt: tx.createdAt.toISOString(),
        updatedAt: tx.updatedAt.toISOString(),
        invoice: tx.invoice
          ? {
              id: tx.invoice.id,
              totalAmount: Number(tx.invoice.totalAmount),
              year: tx.invoice.year,
              month: tx.invoice.month,
              status: tx.invoice.status,
              room: tx.invoice.room ?? null,
            }
          : null,
      };

      return NextResponse.json({ success: true, data } as ApiResponse<typeof data>);
    }

    // ── Fallback: try the simpler Payment model (created by manual entry) ──
    const payment = await prisma.payment.findUnique({
      where: { id },
    });

    if (payment) {
      // Fetch invoice if linked
      const invoice = payment.matchedInvoiceId
        ? await prisma.invoice.findUnique({
            where: { id: payment.matchedInvoiceId },
            select: {
              id: true,
              totalAmount: true,
              year: true,
              month: true,
              status: true,
              room: { select: { roomNo: true } },
            },
          })
        : null;

      const data = {
        id: payment.id,
        amount: Number(payment.amount),
        paymentDate: payment.paidAt.toISOString(),
        referenceNumber: payment.reference ?? null,
        bankAccount: null,
        // Payment.status (PENDING | MATCHED | CONFIRMED | REJECTED) is close enough
        // for the status badge rendering in the detail page
        status: payment.status as string,
        matchType: null,
        matchedAmount: null,
        invoiceId: payment.matchedInvoiceId ?? null,
        createdAt: payment.createdAt.toISOString(),
        updatedAt: payment.updatedAt.toISOString(),
        invoice: invoice
          ? {
              id: invoice.id,
              totalAmount: Number(invoice.totalAmount),
              year: invoice.year,
              month: invoice.month,
              status: invoice.status,
              room: invoice.room ?? null,
            }
          : null,
      };

      return NextResponse.json({ success: true, data } as ApiResponse<typeof data>);
    }

    throw new NotFoundError('Payment', id);
  },
);
