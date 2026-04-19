import { NextRequest, NextResponse } from 'next/server';
import { requireAuthSession } from '@/lib/auth/guards';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { getDocumentGenerationService } from '@/modules/documents/generation.service';
import { documentListQuerySchema } from '@/modules/documents/types';

export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  requireAuthSession(req);
  const url = new URL(req.url);
  const query = documentListQuerySchema.parse({
    templateId: url.searchParams.get('templateId') ?? undefined,
    status: url.searchParams.get('status') ?? undefined,
    type: url.searchParams.get('type') ?? undefined,
    year: url.searchParams.get('year') ?? undefined,
    month: url.searchParams.get('month') ?? undefined,
    roomId: url.searchParams.get('roomId') ?? undefined,
    billingCycleId: url.searchParams.get('billingCycleId') ?? undefined,
    q: url.searchParams.get('q') ?? undefined,
    page: url.searchParams.get('page') ?? undefined,
    pageSize: url.searchParams.get('pageSize') ?? undefined,
  });

  const service = getDocumentGenerationService();
  const result = await service.listDocuments(query);

  return NextResponse.json({
    success: true,
    data: result,
  } as ApiResponse<typeof result>);
});
