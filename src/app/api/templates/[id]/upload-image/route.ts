import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/guards';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { getDocumentTemplateService } from '@/modules/documents/template.service';

export const POST = asyncHandler(async (
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> => {
  requireRole(req, ['ADMIN', 'STAFF']);
  const formData = await req.formData();
  const file = formData.get('file');
  if (!file || typeof file === 'string') {
    return NextResponse.json({ success: false, error: { message: 'No file provided' } }, { status: 400 });
  }
  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ success: false, error: { message: 'Only image files are allowed' } }, { status: 400 });
  }
  const service = getDocumentTemplateService();
  const result = await service.uploadTemplateImage(params.id, file as File);
  return NextResponse.json({ success: true, data: result } as ApiResponse<typeof result>, { status: 201 });
});
