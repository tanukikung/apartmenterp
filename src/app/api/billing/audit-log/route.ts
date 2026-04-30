import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/guards';
import { prisma } from '@/lib';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';

// ============================================================================
// GET /api/billing/audit-log?billingRecordId=X - Get audit logs for a billing record
// ============================================================================

export const GET = asyncHandler(
  async (req: NextRequest): Promise<NextResponse> => {
    requireRole(req, ['ADMIN', 'STAFF', 'OWNER']);

    const { searchParams } = new URL(req.url);
    const billingRecordId = searchParams.get('billingRecordId');

    if (!billingRecordId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: 'billingRecordId is required',
            code: 'VALIDATION_ERROR',
            name: 'ValidationError',
            statusCode: 400,
          },
        },
        { status: 400 }
      );
    }

    const logs = await prisma.billingAuditLog.findMany({
      where: { billingRecordId },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json({
      success: true,
      data: logs,
    } as ApiResponse<typeof logs>);
  }
);