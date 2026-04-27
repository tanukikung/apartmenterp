import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/guards';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { getDocumentTemplateService } from '@/modules/documents/template.service';

export const GET = asyncHandler(async (
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> => {
  requireRole(req, ['ADMIN', 'STAFF']);
  const service = getDocumentTemplateService();
  // Return trash (pending archive) images for this template
  const trash = await service.getTemplateTrashImages(params.id);
  return NextResponse.json({ success: true, data: trash } as ApiResponse<typeof trash>);
});
