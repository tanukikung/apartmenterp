import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib';
import { CONTRACT_STATUS } from '@/lib/constants';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { requireRole } from '@/lib/auth/guards';

interface OverlapCheckResult {
  hasOverlap: boolean;
  conflictingContractId?: string;
}

/**
 * GET /api/contracts/check-overlap
 * Pre-validation endpoint to check if a date range would overlap with an
 * existing ACTIVE contract for a given room.
 *
 * Query params:
 *   roomNo     - room identifier
 *   startDate  - ISO date string for the range start
 *   endDate    - ISO date string for the range end
 */
export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  requireRole(req, ['ADMIN', 'STAFF', 'OWNER']);

  const { searchParams } = new URL(req.url);
  const roomNo = searchParams.get('roomNo');
  const startDateStr = searchParams.get('startDate');
  const endDateStr = searchParams.get('endDate');

  if (!roomNo || !startDateStr || !endDateStr) {
    return NextResponse.json(
      {
        success: false,
        error: {
          message: 'roomNo, startDate, and endDate are required',
          code: 'MISSING_PARAMS',
          name: 'BadRequestError',
          statusCode: 400,
        },
      },
      { status: 400 }
    );
  }

  const startDate = new Date(startDateStr);
  const endDate = new Date(endDateStr);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return NextResponse.json(
      {
        success: false,
        error: {
          message: 'startDate and endDate must be valid ISO date strings',
          code: 'INVALID_DATES',
          name: 'BadRequestError',
          statusCode: 400,
        },
      },
      { status: 400 }
    );
  }

  if (startDate > endDate) {
    return NextResponse.json(
      {
        success: false,
        error: {
          message: 'startDate must be before or equal to endDate',
          code: 'INVALID_DATE_RANGE',
          name: 'BadRequestError',
          statusCode: 400,
        },
      },
      { status: 400 }
    );
  }

  const overlapping = await prisma.contract.findFirst({
    where: {
      roomNo,
      status: CONTRACT_STATUS.ACTIVE,
      OR: [
        {
          AND: [
            { startDate: { lte: startDate } },
            { endDate: { gte: startDate } },
          ],
        },
        {
          AND: [
            { startDate: { lte: endDate } },
            { endDate: { gte: endDate } },
          ],
        },
      ],
    },
    select: { id: true },
  });

  const result: OverlapCheckResult = {
    hasOverlap: !!overlapping,
  };
  if (overlapping) {
    result.conflictingContractId = overlapping.id;
  }

  return NextResponse.json({
    success: true,
    data: result,
  } as ApiResponse<OverlapCheckResult>);
});
