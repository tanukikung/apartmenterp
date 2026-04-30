import { NextRequest, NextResponse } from 'next/server';
import { verifyAuditLogChain } from '@/modules/audit/audit.service';
import { requireOwnerOrAdmin } from '@/lib/auth/guards';
import { asyncHandler } from '@/lib/utils/errors';

export const dynamic = 'force-dynamic';

export const POST = asyncHandler(async (_req: NextRequest): Promise<NextResponse> => {
  requireOwnerOrAdmin(_req);

  const result = await verifyAuditLogChain();

  if (result.valid) {
    return NextResponse.json(
      { success: true, data: { valid: true, total: result.total } },
      { status: 200 },
    );
  }

  return NextResponse.json(
    {
      success: true,
      data: {
        valid: false,
        brokenAt: result.brokenAt,
        total: result.total,
        error: result.error,
      },
    },
    { status: 200 },
  );
});