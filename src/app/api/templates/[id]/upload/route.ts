import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/guards';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { getDocumentTemplateService } from '@/modules/documents/template.service';

export const POST = asyncHandler(async (
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> => {
  const session = requireRole(req, ['ADMIN', 'STAFF']);
  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json(
      { success: false, error: { name: 'BadRequest', message: 'Missing template file', code: 'BAD_REQUEST', statusCode: 400 } },
      { status: 400 },
    );
  }
  const lowerName = file.name.toLowerCase();
  if (!lowerName.endsWith('.html') && !lowerName.endsWith('.htm')) {
    return NextResponse.json(
      { success: false, error: { name: 'BadRequest', message: 'Template upload currently supports HTML files only', code: 'BAD_REQUEST', statusCode: 400 } },
      { status: 400 },
    );
  }

  const service = getDocumentTemplateService();
  const result = await service.uploadTemplateVersion(params.id, file, session.sub);

  return NextResponse.json({
    success: true,
    data: result,
  } as ApiResponse<typeof result>, { status: 201 });
});
