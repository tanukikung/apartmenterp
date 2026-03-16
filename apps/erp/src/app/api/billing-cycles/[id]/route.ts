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

    const cycle = await prisma.billingCycle.findUnique({
      where: { id: params.id },
      include: {
        building: {
          select: { id: true, name: true },
        },
        importBatches: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { id: true },
        },
        billingRecords: {
          select: {
            id: true,
            subtotal: true,
            invoices: {
              select: {
                id: true,
                status: true,
              },
            },
          },
        },
      },
    });

    if (!cycle) {
      throw new NotFoundError('BillingCycle', params.id);
    }

    const totalRecords = cycle.billingRecords.length;
    const totalAmount = cycle.billingRecords.reduce((sum, record) => sum + Number(record.subtotal), 0);
    const invoices = cycle.billingRecords.flatMap((record) => record.invoices);
    const invoicesIssued = invoices.length;
    const paymentsReceived = invoices.filter((invoice) => invoice.status === 'PAID').length;

    const data = {
      id: cycle.id,
      year: cycle.year,
      month: cycle.month,
      status: cycle.status,
      building: cycle.building,
      importBatchId: cycle.importBatches[0]?.id ?? null,
      totalRecords,
      totalAmount,
      invoicesIssued,
      paymentsReceived,
      billingDate: cycle.billingDate,
      dueDate: cycle.dueDate,
      overdueDate: cycle.overdueDate,
      createdAt: cycle.createdAt,
      updatedAt: cycle.updatedAt,
    };

    return NextResponse.json({
      success: true,
      data,
    } as ApiResponse<typeof data>);
  },
);
