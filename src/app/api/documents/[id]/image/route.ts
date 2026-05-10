import { NextRequest, NextResponse } from 'next/server';
import { asyncHandler, NotFoundError } from '@/lib/utils/errors';
import { logAudit } from '@/modules/audit';
import { getDocumentGenerationService } from '@/modules/documents/generation.service';
import { generateDocumentImage } from '@/modules/documents/pdf.service';
import { getStorage } from '@/infrastructure/storage';

export const GET = asyncHandler(async (
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> => {
  const service = getDocumentGenerationService();
  const document = await service.getDocumentById(params.id);
  const htmlFile = document.files.find((file) => file.role === 'SOURCE_HTML');
  if (!htmlFile) {
    throw new NotFoundError('Generated document HTML source', params.id);
  }

  const storage = getStorage();
  const htmlBuffer = await storage.downloadFile(htmlFile.storageKey);
  const image = await generateDocumentImage(document.title, htmlBuffer.toString('utf8'));

  await logAudit({
    req,
    action: 'GENERATED_DOCUMENT_IMAGE_EXPORTED',
    entityType: 'GENERATED_DOCUMENT',
    entityId: params.id,
    metadata: {
      fileRole: 'SOURCE_HTML',
      format: 'png',
    },
  });

  const filename = `document_${params.id}.png`;
  return new NextResponse(new Uint8Array(image), {
    status: 200,
    headers: {
      'content-type': 'image/png',
      'content-disposition': `inline; filename="${filename}"`,
      'cache-control': 'no-store',
      'content-length': String(image.byteLength),
    },
  });
});
