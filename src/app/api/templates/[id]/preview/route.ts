import { NextRequest, NextResponse } from 'next/server';
import { requireAuthSession } from '@/lib/auth/guards';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { getDocumentTemplateService } from '@/modules/documents/template.service';
import { templatePreviewRequestSchema } from '@/modules/documents/types';

export const POST = asyncHandler(async (
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> => {
  const session = requireAuthSession(req);
  const body = templatePreviewRequestSchema.parse(await req.json().catch(() => ({})));
  const service = getDocumentTemplateService();
  const result = await service.previewTemplate(params.id, body, session.sub);

  return NextResponse.json({
    success: true,
    data: result,
  } as ApiResponse<typeof result>);
});
