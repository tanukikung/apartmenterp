import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/guards';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { getDocumentTemplateService } from '@/modules/documents/template.service';

export const POST = asyncHandler(async (
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> => {
  const session = requireRole(req, ['ADMIN', 'STAFF']);
  const service = getDocumentTemplateService();
  const result = await service.duplicateTemplate(params.id, session.sub);
  return NextResponse.json({ success: true, data: result } as ApiResponse<typeof result>, { status: 201 });
});
