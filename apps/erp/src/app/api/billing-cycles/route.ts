import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { requireAuthSession } from '@/lib/auth/guards';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';

export const dynamic = 'force-dynamic';

/**
 * GET /api/billing-cycles
 *
 * Returns a paginated list of BillingCycles with aggregate stats:
 *   totalRecords   — number of billing records in the cycle
 *   totalAmount    — sum of billing record subtotals
 *   invoiceCount   — total invoices issued for the cycle
 *   pendingInvoices — invoices not yet PAID (GENERATED + SENT + VIEWED + OVERDUE)
 *
 * Query params:
 *   buildingId?   string
 *   year?         number
 *   month?        number
 *   status?       OPEN | IMPORTED | LOCKED | INVOICED | CLOSED
 *   page          default 1
 *   pageSize      default 20 (max 100)
 *   sortBy        year | month | createdAt (default createdAt)
 *   sortOrder     asc | desc (default desc)
 */
export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  requireAuthSession(req);

  const url = new URL(req.url);
  const buildingId = url.searchParams.get('buildingId') ?? undefined;
  const year = url.searchParams.get('year') ? Number(url.searchParams.get('year')) : undefined;
  const month = url.searchParams.get('month') ? Number(url.searchParams.get('month')) : undefined;
  const status = url.searchParams.get('status') ?? undefined;
  const page = Math.max(1, Number(url.searchParams.get('page') ?? '1'));
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('pageSize') ?? '20')));
  const sortBy = (url.searchParams.get('sortBy') ?? 'createdAt') as 'year' | 'month' | 'createdAt';
  const sortOrder = (url.searchParams.get('sortOrder') ?? 'desc') as 'asc' | 'desc';

  const where = {
    ...(buildingId ? { buildingId } : {}),
    ...(year !== undefined ? { year } : {}),
    ...(month !== undefined ? { month } : {}),
    ...(status ? { status: status as never } : {}),
  };

  const orderBy =
    sortBy === 'year'
      ? [{ year: sortOrder }, { month: sortOrder }]
      : sortBy === 'month'
        ? [{ month: sortOrder }, { year: sortOrder }]
        : [{ createdAt: sortOrder }];

  const [total, cycles] = await Promise.all([
    prisma.billingCycle.count({ where }),
    prisma.billingCycle.findMany({
      where,
      orderBy: orderBy as Parameters<typeof prisma.billingCycle.findMany>[0]['orderBy'],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        building: { select: { id: true, name: true } },
        billingRecords: {
          select: {
            id: true,
            subtotal: true,
            invoices: {
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

  const data = cycles.map((cycle) => {
    const totalRecords = cycle.billingRecords.length;
    const totalAmount = cycle.billingRecords.reduce(
      (sum, r) => sum + Number(r.subtotal),
      0,
    );
    const allInvoices = cycle.billingRecords.flatMap((r) => r.invoices);
    const invoiceCount = allInvoices.length;
    const pendingInvoices = allInvoices.filter(
      (inv) =>
        inv.status === 'GENERATED' ||
        inv.status === 'SENT' ||
        inv.status === 'VIEWED' ||
        inv.status === 'OVERDUE',
    ).length;

    return {
      id: cycle.id,
      year: cycle.year,
      month: cycle.month,
      status: cycle.status,
      building: cycle.building,
      billingDate: cycle.billingDate,
      dueDate: cycle.dueDate,
      overdueDate: cycle.overdueDate,
      totalRecords,
      totalAmount,
      invoiceCount,
      pendingInvoices,
      importBatchId: cycle.importBatches[0]?.id ?? null,
      createdAt: cycle.createdAt,
      updatedAt: cycle.updatedAt,
    };
  });

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
