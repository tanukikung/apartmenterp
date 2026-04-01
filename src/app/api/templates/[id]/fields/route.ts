import { NextRequest, NextResponse } from 'next/server';
import { requireAuthSession } from '@/lib/auth/guards';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { getDocumentTemplateService } from '@/modules/documents/template.service';

export const GET = asyncHandler(async (
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> => {
  requireAuthSession(req);
  const service = getDocumentTemplateService();
  const result = await service.getTemplateFields(params.id);

  return NextResponse.json({
    success: true,
    data: result,
  } as ApiResponse<typeof result>);
});
