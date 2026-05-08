import { NextRequest, NextResponse } from 'next/server';
import { verifyAuditLogChain } from '@/modules/audit/audit.service';
import { requireOwnerOrAdmin } from '@/lib/auth/guards';
import { asyncHandler } from '@/lib/utils/errors';

export const dynamic = 'force-dynamic';

export const POST = asyncHandler(async (_req: NextRequest): Promise<NextResponse> => {
  await requireOwnerOrAdmin(_req);

  const result = await verifyAuditLogChain();

  // No logs = valid chain (nothing to break)
  if (result.total === 0) {
    return NextResponse.json(
      { success: true, data: { valid: true, message: 'No audit logs to verify' } },
      { status: 200 },
    );
  }

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
        error: 'AUDIT_CHAIN_BROKEN',
        message: result.error ?? 'Hash mismatch detected',
      },
    },
    { status: 200 },
  );
});