import { NextRequest, NextResponse } from 'next/server';
import { asyncHandler } from '@/lib/utils/errors';
import { getPaymentMatchingService } from '@/modules/payments/payment-matching.service';
import { z } from 'zod';

const reviewListSchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
});

export const GET = asyncHandler(async (request: NextRequest): Promise<NextResponse> => {
  const searchParams = request.nextUrl.searchParams;
  
  const limit = parseInt(searchParams.get('limit') || '50');
  const offset = parseInt(searchParams.get('offset') || '0');

  const validation = reviewListSchema.safeParse({ limit, offset });
  if (!validation.success) {
    return NextResponse.json(
      { success: false, error: 'Invalid query parameters', details: validation.error.errors },
      { status: 400 }
    );
  }

  try {
    const service = getPaymentMatchingService();
    const result = await service.getMatchesForReview(limit, offset);

    return NextResponse.json({
      success: true,
      data: {
        transactions: result.transactions,
        total: result.total,
        limit,
        offset,
      },
    });
  } catch {
    return NextResponse.json(
      { success: false, error: 'Failed to fetch review list' },
      { status: 500 }
    );
  }
});
