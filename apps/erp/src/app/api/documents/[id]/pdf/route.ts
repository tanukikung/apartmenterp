import { NextRequest, NextResponse } from 'next/server';
import { requireAuthSession } from '@/lib/auth/guards';
import { asyncHandler, NotFoundError } from '@/lib/utils/errors';
import { getDocumentGenerationService } from '@/modules/documents/generation.service';
import { logAudit } from '@/modules/audit';

export const GET = asyncHandler(async (
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> => {
  const session = requireAuthSession(req);
  const service = getDocumentGenerationService();
  const document = await service.getDocumentById(params.id);
  const pdf = document.files.find((file) => file.role === 'PDF');
  if (!pdf) {
    throw new NotFoundError('Generated document PDF', params.id);
  }

  await logAudit({
    actorId: session.sub,
    actorRole: session.role,
    action: 'GENERATED_DOCUMENT_PDF_EXPORTED',
    entityType: 'GENERATED_DOCUMENT',
    entityId: params.id,
    metadata: {
      fileRole: 'PDF',
      format: 'pdf',
    },
  });

  return NextResponse.redirect(new URL(pdf.url, req.url));
});
