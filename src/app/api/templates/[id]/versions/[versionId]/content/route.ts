import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/guards';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { getDocumentTemplateService } from '@/modules/documents/template.service';

export const GET = asyncHandler(async (
  req: NextRequest,
  { params }: { params: { id: string; versionId: string } },
): Promise<NextResponse> => {
  requireRole(req, ['ADMIN', 'STAFF']);
  const service = getDocumentTemplateService();
  const version = await service.getVersionContent(params.id, params.versionId);
  return NextResponse.json({ success: true, data: version } as ApiResponse<typeof version>);
});

export const PATCH = asyncHandler(async (
  req: NextRequest,
  { params }: { params: { id: string; versionId: string } },
): Promise<NextResponse> => {
  requireRole(req, ['ADMIN', 'STAFF']);
  const body = await req.json();
  const service = getDocumentTemplateService();
  const updated = await service.updateVersionContent(params.id, params.versionId, body.body ?? '', body.subject ?? null);
  return NextResponse.json({ success: true, data: updated } as ApiResponse<typeof updated>);
});
