import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/guards';
import { asyncHandler, NotFoundError } from '@/lib/utils/errors';
import { getDocumentGenerationService } from '@/modules/documents/generation.service';
import { logAudit } from '@/modules/audit';

export const GET = asyncHandler(async (
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> => {
  requireRole(req, ['ADMIN', 'STAFF', 'OWNER']);
  const service = getDocumentGenerationService();
  const document = await service.getDocumentById(params.id);
  const format = (new URL(req.url).searchParams.get('format') || 'pdf').toLowerCase();
  const file =
    document.files.find((candidate) => candidate.format.toLowerCase() === format) ??
    document.files.find((candidate) => candidate.role === 'PDF');

  if (!file) {
    throw new NotFoundError('Generated document file', params.id);
  }

  await logAudit({
    req,
    action: 'GENERATED_DOCUMENT_FILE_EXPORTED',
    entityType: 'GENERATED_DOCUMENT',
    entityId: params.id,
    metadata: {
      fileRole: file.role,
      format: file.format,
    },
  });

  return NextResponse.redirect(new URL(file.url, req.url));
});
