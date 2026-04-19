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
  const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']);
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return NextResponse.json({ success: false, error: { message: 'Only PNG, JPEG, WebP, GIF or SVG images are allowed' } }, { status: 400 });
  }
  const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10 MB
  if (file.size > MAX_IMAGE_SIZE) {
    return NextResponse.json({ success: false, error: { message: 'Image too large (max 10 MB)' } }, { status: 400 });
  }
  const service = getDocumentTemplateService();
  const result = await service.uploadTemplateImage(params.id, file as File);
  return NextResponse.json({ success: true, data: result } as ApiResponse<typeof result>, { status: 201 });
});
