import { NextRequest, NextResponse } from 'next/server';
import { requireAuthSession } from '@/lib/auth/guards';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { getDocumentGenerationService } from '@/modules/documents/generation.service';

export const GET = asyncHandler(async (
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> => {
  requireAuthSession(req);
  const service = getDocumentGenerationService();
  const result = await service.getDocumentById(params.id);

  return NextResponse.json({
    success: true,
    data: result,
  } as ApiResponse<typeof result>);
});
