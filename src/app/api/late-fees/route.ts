import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib';
import { asyncHandler } from '@/lib/utils/errors';
import { requireRole } from '@/lib/auth/guards';

// ============================================================================
// Types
// ============================================================================

type LateFeeInvoice = {
  id: string;
  roomNo: string;
  year: number;
  month: number;
  status: string;
  totalAmount: number;
  lateFeeAmount: number;
  lateFeeAppliedAt: string | null;
  dueDate: string;
  paidAt: string | null;
  roomStatus: string;
  tenants: Array<{ firstName: string; lastName: string }>;
  rule: {
    penaltyPerDay: number;
    maxPenalty: number;
    gracePeriodDays: number;
  } | null;
};

type LateFeeListResponse = {
  invoices: LateFeeInvoice[];
  total: number;
  page: number;
  pageSize: number;
};

type LateFeeUpdateResult =
  | { invoiceId: string; success: true; lateFeeAmount: number }
  | { invoiceId: string; success: false; error: string };

// ============================================================================
// GET /api/late-fees — List overdue invoices with late fees for admin review
// ============================================================================

export const GET = asyncHandler(
  async (req: NextRequest): Promise<NextResponse> => {
    requireRole(req, ['ADMIN', 'STAFF']);

    const url = new URL(req.url);
    const status = url.searchParams.get('status'); // OVERDUE, PAID, all
    const roomNo = url.searchParams.get('roomNo');
    const page = parseInt(url.searchParams.get('page') ?? '1', 10);
    const pageSize = parseInt(url.searchParams.get('pageSize') ?? '50', 10);
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = {};
    if (status === 'OVERDUE') {
      where.status = 'OVERDUE';
    } else if (status === 'PAID') {
      where.status = 'PAID';
    }
    if (roomNo) {
      where.roomNo = roomNo;
    }

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        include: {
          room: {
            include: {
              tenants: {
                where: { moveOutDate: null },
                include: { tenant: true },
              },
            },
          },
          roomBilling: {
            include: { effectiveRule: true },
          },
        },
        orderBy: { dueDate: 'asc' },
        skip,
        take: pageSize,
      }),
      prisma.invoice.count({ where }),
    ]);

    const response: LateFeeListResponse = {
      invoices: invoices.map((inv) => ({
        id: inv.id,
        roomNo: inv.roomNo,
        year: inv.year,
        month: inv.month,
        status: inv.status,
        totalAmount: Number(inv.totalAmount),
        lateFeeAmount: Number(inv.lateFeeAmount),
        lateFeeAppliedAt: inv.lateFeeAppliedAt?.toISOString() ?? null,
        dueDate: inv.dueDate.toISOString(),
        paidAt: inv.paidAt?.toISOString() ?? null,
        roomStatus: inv.room.roomStatus,
        tenants: inv.room.tenants.map((rt) => ({
          firstName: rt.tenant.firstName,
          lastName: rt.tenant.lastName,
        })),
        rule: inv.roomBilling?.effectiveRule
          ? {
              penaltyPerDay: Number(inv.roomBilling.effectiveRule.penaltyPerDay),
              maxPenalty: Number(inv.roomBilling.effectiveRule.maxPenalty),
              gracePeriodDays: (inv.roomBilling.effectiveRule as { gracePeriodDays?: number }).gracePeriodDays ?? 0,
            }
          : null,
      })),
      total,
      page,
      pageSize,
    };

    return NextResponse.json({ success: true, data: response });
  }
);

// ============================================================================
// PUT /api/late-fees — Update (approve/adjust) late fee for one or more invoices
// ============================================================================

export const PUT = asyncHandler(
  async (req: NextRequest): Promise<NextResponse> => {
    requireRole(req, ['ADMIN']);

    const body = await req.json();
    const { updates, actorId: __actorId } = body as {
      updates: Array<{ invoiceId: string; lateFeeAmount: number; note?: string }>;
      actorId: string;
    };

    if (!Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: 'BAD_REQUEST', message: 'updates array is required' } },
        { status: 400 }
      );
    }

    const results: LateFeeUpdateResult[] = [];
    for (const update of updates) {
      const { invoiceId, lateFeeAmount, note } = update;
      const current = await prisma.invoice.findUnique({ where: { id: invoiceId } });
      if (!current) {
        results.push({ invoiceId, success: false, error: 'Invoice not found' });
        continue;
      }

      const updated = await prisma.invoice.update({
        where: { id: invoiceId },
        data: {
          lateFeeAmount,
          note: note ?? current.note,
          lateFeeAppliedAt: new Date(),
        },
      });
      results.push({ invoiceId, success: true, lateFeeAmount: Number(updated.lateFeeAmount) });
    }

    return NextResponse.json({ success: true, data: { results } });
  }
);
