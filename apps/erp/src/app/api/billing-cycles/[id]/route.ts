import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { requireAuthSession } from '@/lib/auth/guards';
import { asyncHandler, type ApiResponse, NotFoundError } from '@/lib/utils/errors';

export const dynamic = 'force-dynamic';

export const GET = asyncHandler(
  async (
    req: NextRequest,
    { params }: { params: { id: string } },
  ): Promise<NextResponse> => {
    requireAuthSession(req);

    const period = await prisma.billingPeriod.findUnique({
      where: { id: params.id },
      include: {
        importBatches: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { id: true },
        },
        roomBillings: {
          include: {
            invoice: {
              select: {
                id: true,
                status: true,
              },
            },
          },
        },
      },
    });

    if (!period) {
      throw new NotFoundError('BillingPeriod', params.id);
    }

    const totalRecords = period.roomBillings.length;
    const totalAmount = period.roomBillings.reduce((sum, record) => sum + Number(record.totalDue), 0);
    const invoices = period.roomBillings
      .map((r) => r.invoice)
      .filter((inv): inv is NonNullable<typeof inv> => inv !== null);
    const invoicesIssued = invoices.length;
    const paymentsReceived = invoices.filter((invoice) => invoice.status === 'PAID').length;

    const data = {
      id: period.id,
      year: period.year,
      month: period.month,
      status: period.status,
      importBatchId: period.importBatches[0]?.id ?? null,
      totalRecords,
      totalAmount,
      invoicesIssued,
      paymentsReceived,
      createdAt: period.createdAt,
      updatedAt: period.updatedAt,
    };

    return NextResponse.json({
      success: true,
      data,
    } as ApiResponse<typeof data>);
  },
);
