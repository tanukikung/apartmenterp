import { NextRequest, NextResponse } from 'next/server';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { requireRole } from '@/lib/auth/guards';
import { prisma } from '@/lib';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// GET /api/payments/[id]/history
// Returns PaymentHistory[] ordered by createdAt asc for a given payment.
// ---------------------------------------------------------------------------

type PaymentHistoryEntry = {
  id: string;
  paymentId: string | null;
  action: string;
  actorId: string;
  actorRole: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export const GET = asyncHandler(
  async (
    _req: NextRequest,
    { params }: { params: { id: string } },
  ): Promise<NextResponse> => {
    requireRole(_req, ['ADMIN']);
    const { id: paymentId } = params;

    const history = await prisma.paymentHistory.findMany({
      where: { paymentId },
      orderBy: { createdAt: 'asc' },
    });

    if (history.length === 0) {
      // Return empty array instead of 404 — history may legitimately be empty
      return NextResponse.json(
        { success: true, data: [] } as ApiResponse<PaymentHistoryEntry[]>,
      );
    }

    const data: PaymentHistoryEntry[] = history.map((h) => ({
      id: h.id,
      paymentId: h.paymentId,
      action: h.action,
      actorId: h.actorId,
      actorRole: h.actorRole,
      metadata: (h.metadata as Record<string, unknown>) ?? null,
      createdAt: h.createdAt.toISOString(),
    }));

    return NextResponse.json({ success: true, data } as ApiResponse<PaymentHistoryEntry[]>);
  },
);