import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/guards';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { getDocumentTemplateService } from '@/modules/documents/template.service';

export const POST = asyncHandler(async (
  req: NextRequest,
  { params }: { params: { id: string; versionId: string } },
): Promise<NextResponse> => {
  // Auth required; actorId not recorded for pure validation checks.
  const _session = requireRole(req, ['ADMIN', 'STAFF']);
  const service = getDocumentTemplateService();

  // Verify the version belongs to this template
  const version = await service.getTemplateById(params.id);
  const found = version.versions?.some((v) => v.id === params.versionId);
  if (!found) {
    return NextResponse.json(
      { success: false, error: { message: 'Version not found', code: 'NOT_FOUND' } },
      { status: 404 },
    );
  }

  const result = await service.validateVersion(params.versionId);
  return NextResponse.json({
    success: true,
    data: result,
  } as ApiResponse<typeof result>);
});
