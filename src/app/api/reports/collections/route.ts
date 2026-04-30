import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { requireRole } from '@/lib/auth/guards';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

// ============================================================================
// Types
// ============================================================================

interface CollectionsRow {
  id: string;
  roomNo: string;
  floorNo: number;
  tenantName: string | null;
  tenantPhone: string | null;
  year: number;
  month: number;
  totalAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  dueDate: string;
  status: string;
  daysOverdue: number;
  lastPaymentDate: string | null;
}

// ============================================================================
// Query schema
// ============================================================================

const collectionsQuerySchema = z.object({
  floorNo: z.coerce.number().int().min(1).max(100).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  minAmount: z.coerce.number().min(0).optional(),
  maxAmount: z.coerce.number().min(0).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(200),
});

// ============================================================================
// Helpers
// ============================================================================

function daysOverdue(dueDate: Date): number {
  const now = new Date();
  const ms = now.getTime() - dueDate.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function fmtDate(d: Date | null | undefined): string | null {
  if (!d) return null;
  return d.toISOString();
}

// ============================================================================
// GET /api/reports/collections
// ============================================================================

export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  requireRole(req, ['ADMIN', 'STAFF', 'OWNER']);

  const url = new URL(req.url);
  const rawParams = {
    floorNo: url.searchParams.get('floorNo') ?? undefined,
    year: url.searchParams.get('year') ?? undefined,
    month: url.searchParams.get('month') ?? undefined,
    minAmount: url.searchParams.get('minAmount') ?? undefined,
    maxAmount: url.searchParams.get('maxAmount') ?? undefined,
    page: url.searchParams.get('page') ?? '1',
    pageSize: url.searchParams.get('pageSize') ?? '200',
  };

  const params = collectionsQuerySchema.parse(rawParams);

  // Build where clause: only OVERDUE invoices, plus any invoice with outstanding balance
  // The Invoice status field will be OVERDUE for unpaid invoices past due date.
  // We also include GENERATED/SENT/VIEWED invoices past their due date (they should be OVERDUE already).
  const whereClause: Record<string, unknown> = {
    status: 'OVERDUE',
  };

  if (params.floorNo) {
    whereClause.room = { floorNo: params.floorNo };
  }
  if (params.year) whereClause.year = params.year;
  if (params.month) whereClause.month = params.month;
  if (params.minAmount) whereClause.totalAmount = { ...((whereClause.totalAmount as Record<string, unknown>) ?? {}), gte: params.minAmount };
  if (params.maxAmount) whereClause.totalAmount = { ...((whereClause.totalAmount as Record<string, unknown>) ?? {}), lte: params.maxAmount };

  // Get total count
  const total = await prisma.invoice.count({ where: whereClause });

  const invoices = await prisma.invoice.findMany({
    where: whereClause,
    include: {
      room: {
        include: {
          tenants: {
            where: { role: 'PRIMARY', moveOutDate: null },
            include: { tenant: true },
            take: 1,
          },
        },
      },
      paymentMatches: {
        where: { status: { in: ['CONFIRMED', 'PENDING'] } },
        include: { payment: true },
      },
    },
    orderBy: [{ room: { floorNo: 'asc' } }, { room: { roomNo: 'asc' } }],
    skip: (params.page - 1) * params.pageSize,
    take: params.pageSize,
  });

  // Compute summary KPIs
  const totalOutstanding = invoices.reduce(
    (sum, inv) => sum + Number(inv.totalAmount) - inv.paymentMatches.reduce((s, m) => s + Number(m.payment.amount), 0),
    0,
  );
  const overdueCount = invoices.length;
  const uniqueRooms = new Set(invoices.map((inv) => inv.roomNo)).size;
  const avgDebt = overdueCount > 0 ? Math.round(totalOutstanding / overdueCount) : 0;
  const maxDaysOverdue =
    overdueCount > 0
      ? Math.max(...invoices.map((inv) => daysOverdue(inv.dueDate)))
      : 0;

  // Build rows with per-invoice paid amount, outstanding, last payment date
  const rows: CollectionsRow[] = invoices.map((inv) => {
    const paidAmt = inv.paymentMatches.reduce((s, m) => s + Number(m.payment.amount), 0);
    const totalAmt = Number(inv.totalAmount);
    const outstanding = totalAmt - paidAmt;
    const lastPaymentMatch = inv.paymentMatches
      .filter((m) => m.payment.paidAt)
      .sort((a, b) => b.payment.paidAt!.getTime() - a.payment.paidAt!.getTime())[0];
    const primaryTenant = inv.room.tenants[0]?.tenant;
    return {
      id: inv.id,
      roomNo: inv.roomNo,
      floorNo: inv.room.floorNo,
      tenantName: primaryTenant
        ? `${primaryTenant.firstName} ${primaryTenant.lastName}`.trim()
        : inv.room.tenants[0]?.tenant?.firstName ?? null,
      tenantPhone: primaryTenant?.phone ?? null,
      year: inv.year,
      month: inv.month,
      totalAmount: totalAmt,
      paidAmount: paidAmt,
      outstandingAmount: outstanding,
      dueDate: fmtDate(inv.dueDate) ?? '',
      status: inv.status,
      daysOverdue: Math.max(0, daysOverdue(inv.dueDate)),
      lastPaymentDate: lastPaymentMatch ? fmtDate(lastPaymentMatch.payment.paidAt) : null,
    };
  });

  // Sort by days overdue descending
  rows.sort((a, b) => b.daysOverdue - a.daysOverdue);

  const totalPages = Math.ceil(total / params.pageSize);

  return NextResponse.json({
    success: true,
    data: {
      rows,
      summary: {
        totalOutstanding,
        overdueCount,
        uniqueRooms,
        avgDebt,
        maxDaysOverdue,
      },
      pagination: {
        total,
        page: params.page,
        pageSize: params.pageSize,
        totalPages,
      },
    },
  } as ApiResponse<{
    rows: CollectionsRow[];
    summary: {
      totalOutstanding: number;
      overdueCount: number;
      uniqueRooms: number;
      avgDebt: number;
      maxDaysOverdue: number;
    };
    pagination: { total: number; page: number; pageSize: number; totalPages: number };
  }>);
});
