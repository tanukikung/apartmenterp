import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { requireAuthSession } from '@/lib/auth/guards';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import type { BillingPeriodStatus } from '@prisma/client';
import { BILLING_PERIOD_STATUS, INVOICE_STATUS } from '@/lib/constants';

export const dynamic = 'force-dynamic';

/**
 * GET /api/billing-cycles
 *
 * Returns a paginated list of BillingPeriods with aggregate stats.
 * BillingCycle model was replaced by BillingPeriod in the new schema.
 */
export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  requireAuthSession(req);

  const url = new URL(req.url);
  const year = url.searchParams.get('year') ? Number(url.searchParams.get('year')) : undefined;
  const month = url.searchParams.get('month') ? Number(url.searchParams.get('month')) : undefined;
  const status = url.searchParams.get('status') ?? undefined;
  const page = Math.max(1, Number(url.searchParams.get('page') ?? '1'));
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('pageSize') ?? '20')));
  const sortBy = (url.searchParams.get('sortBy') ?? 'createdAt') as 'year' | 'month' | 'createdAt';
  const sortOrder = (url.searchParams.get('sortOrder') ?? 'desc') as 'asc' | 'desc';

  // Validate status against BillingPeriodStatus enum so Prisma never receives an invalid value
  const VALID_BILLING_PERIOD_STATUSES = [BILLING_PERIOD_STATUS.OPEN, BILLING_PERIOD_STATUS.LOCKED, BILLING_PERIOD_STATUS.CLOSED] as const;
  if (status && !VALID_BILLING_PERIOD_STATUSES.includes(status as typeof VALID_BILLING_PERIOD_STATUSES[number])) {
    return NextResponse.json(
      { success: false, error: { code: 'INVALID_STATUS', message: `Invalid status '${status}'. Must be one of: ${VALID_BILLING_PERIOD_STATUSES.join(', ')}` } },
      { status: 400 }
    );
  }

  const where = {
    ...(year !== undefined ? { year } : {}),
    ...(month !== undefined ? { month } : {}),
    ...(status ? { status: status as BillingPeriodStatus } : {}),
  };

  const orderBy: Record<string, 'asc' | 'desc'>[] =
    sortBy === 'year'
      ? [{ year: sortOrder }, { month: sortOrder }]
      : sortBy === 'month'
        ? [{ month: sortOrder }, { year: sortOrder }]
        : [{ createdAt: sortOrder }];

  const [total, periods] = await Promise.all([
    prisma.billingPeriod.count({ where }),
    prisma.billingPeriod.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        roomBillings: {
          include: {
            invoice: {
              select: { id: true, status: true },
            },
          },
        },
        importBatches: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { id: true, status: true },
        },
      },
    }),
  ]);

  const data = periods.map((period) => {
    const totalRecords = period.roomBillings.length;
    const totalAmount = period.roomBillings.reduce(
      (sum, r) => sum + Number(r.totalDue),
      0,
    );
    const allInvoices = period.roomBillings
      .map((r) => r.invoice)
      .filter((inv): inv is NonNullable<typeof inv> => inv !== null);
    const invoiceCount = allInvoices.length;
    const pendingInvoices = allInvoices.filter(
      (inv) =>
        inv.status === INVOICE_STATUS.GENERATED ||
        inv.status === INVOICE_STATUS.SENT ||
        inv.status === INVOICE_STATUS.VIEWED ||
        inv.status === INVOICE_STATUS.OVERDUE,
    ).length;

    return {
      id: period.id,
      year: period.year,
      month: period.month,
      status: period.status,
      totalRecords,
      totalAmount,
      invoiceCount,
      pendingInvoices,
      importBatchId: period.importBatches[0]?.id ?? null,
      createdAt: period.createdAt,
      updatedAt: period.updatedAt,
      // populated by the count query below
      totalRooms: 0,
      missingRooms: 0,
    };
  });

  // Count total rooms in the rental pool (VACANT + OCCUPIED) to compute missingRooms
  const totalActiveRooms = await prisma.room.count({
    where: { roomStatus: { in: ['VACANT', 'OCCUPIED'] } },
  });
  for (const period of data) {
    (period as { totalRooms: number; missingRooms: number }).totalRooms = totalActiveRooms;
    (period as { totalRooms: number; missingRooms: number }).missingRooms = totalActiveRooms - period.totalRecords;
  }

  return NextResponse.json({
    success: true,
    data: {
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    },
  } as ApiResponse<{ data: typeof data; total: number; page: number; pageSize: number; totalPages: number }>);
});
