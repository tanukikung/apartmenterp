import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/guards';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { getDocumentTemplateService } from '@/modules/documents/template.service';

export const PATCH = asyncHandler(async (
  req: NextRequest,
  { params }: { params: { id: string; imageId: string } },
): Promise<NextResponse> => {
  requireRole(req, ['ADMIN', 'STAFF']);
  const service = getDocumentTemplateService();

  const body = await req.json().catch(() => ({}));
  if (body.action === 'restore') {
    // Restore from trash back to active
    const restored = await service.restoreTemplateImage(params.id, params.imageId);
    return NextResponse.json({ success: true, data: restored } as ApiResponse<typeof restored>);
  }

  if (body.action === 'archive') {
    // Mark image as pending archive (soft delete from document)
    const archived = await service.archiveTemplateImage(params.id, params.imageId);
    return NextResponse.json({ success: true, data: archived } as ApiResponse<typeof archived>);
  }

  return NextResponse.json({ success: false, error: { message: 'Unknown action' } }, { status: 400 });
});