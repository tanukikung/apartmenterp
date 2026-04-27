import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib';
import { asyncHandler } from '@/lib/utils/errors';
import { requireRole } from '@/lib/auth/guards';
import { parsePagination } from '@/lib/utils/pagination';

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
  | { invoiceId: string; success: true; lateFeeAmount: number; alreadyApplied?: boolean }
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
    const { page, pageSize, skip } = parsePagination(req, { defaultSize: 50 });

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

    // Wrap in transaction so a partial failure rolls back the whole batch.
    // Also skip invoices that already had a late fee applied — defends against
    // double-click duplicate application and preserves the original timestamp.
    const results: LateFeeUpdateResult[] = await prisma.$transaction(async (tx) => {
      const out: LateFeeUpdateResult[] = [];
      for (const update of updates) {
        const { invoiceId, lateFeeAmount, note } = update;
        const current = await tx.invoice.findUnique({
          where: { id: invoiceId },
          include: { roomBilling: { include: { effectiveRule: true } } },
        });
        if (!current) {
          out.push({ invoiceId, success: false, error: 'Invoice not found' });
          continue;
        }
        if (current.lateFeeAppliedAt) {
          out.push({
            invoiceId,
            success: true,
            lateFeeAmount: Number(current.lateFeeAmount),
            alreadyApplied: true,
          });
          continue;
        }

        const rule = current.roomBilling?.effectiveRule;
        const gracePeriodDays = (rule as unknown as { gracePeriodDays?: number } | null)?.gracePeriodDays ?? 0;
        const maxPenalty = rule ? Number((rule as unknown as { maxPenalty?: number }).maxPenalty ?? Infinity) : Infinity;

        const dueDate = new Date(current.dueDate);
        dueDate.setHours(0, 0, 0, 0);
        const graceCutoff = new Date(dueDate);
        graceCutoff.setDate(graceCutoff.getDate() + gracePeriodDays);

        let appliedAmount = lateFeeAmount;
        if (gracePeriodDays > 0 && new Date() < graceCutoff) {
          appliedAmount = 0;
        } else if (appliedAmount > maxPenalty) {
          appliedAmount = maxPenalty;
        }

        const updated = await tx.invoice.update({
          where: { id: invoiceId },
          data: {
            lateFeeAmount: appliedAmount,
            note: note ?? current.note,
            lateFeeAppliedAt: appliedAmount > 0 ? new Date() : null,
          },
        });
        out.push({ invoiceId, success: true, lateFeeAmount: Number(updated.lateFeeAmount) });
      }
      return out;
    });

    return NextResponse.json({ success: true, data: { results } });
  }
);
