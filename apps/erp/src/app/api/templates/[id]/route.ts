import { NextRequest, NextResponse } from 'next/server';
import { requireAuthSession, requireRole } from '@/lib/auth/guards';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { getDocumentTemplateService } from '@/modules/documents/template.service';
import { updateTemplateSchema } from '@/modules/documents/types';

export const GET = asyncHandler(async (
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> => {
  requireAuthSession(req);
  const service = getDocumentTemplateService();
  const result = await service.getTemplateById(params.id);

  return NextResponse.json({
    success: true,
    data: result,
  } as ApiResponse<typeof result>);
});

export const PATCH = asyncHandler(async (
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> => {
  const session = requireRole(req, ['ADMIN', 'STAFF']);
  const body = updateTemplateSchema.parse(await req.json());
  const service = getDocumentTemplateService();
  const result = await service.updateTemplate(params.id, body, session.sub);

  return NextResponse.json({
    success: true,
    data: result,
  } as ApiResponse<typeof result>);
});
