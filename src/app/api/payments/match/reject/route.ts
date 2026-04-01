import { NextRequest, NextResponse } from 'next/server';
import { asyncHandler } from '@/lib/utils/errors';
import { requireRole } from '@/lib/auth/guards';
import { getServiceContainer } from '@/lib/service-container';
import { z } from 'zod';

const rejectMatchSchema = z.object({
  transactionId: z.string(),
  rejectReason: z.string().optional(),
});

export const POST = asyncHandler(async (request: NextRequest): Promise<NextResponse> => {
  const session = requireRole(request, ['ADMIN', 'STAFF']);
  const body = await request.json();

  const validation = rejectMatchSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { success: false, error: 'Invalid request data', details: validation.error.errors },
      { status: 400 }
    );
  }

  const { transactionId, rejectReason } = validation.data;
  const userId = session.sub;

  try {
    const service = getServiceContainer().paymentMatchingService;
    await service.rejectMatch(transactionId, userId, rejectReason);

    return NextResponse.json({
      success: true,
      data: { message: 'Match rejected successfully' },
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Failed to reject match' },
      { status: 500 }
    );
  }
});
