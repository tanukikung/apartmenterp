import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/guards';
import { asyncHandler, type ApiResponse, NotFoundError } from '@/lib/utils/errors';
import { getDocumentGenerationService } from '@/modules/documents/generation.service';
import { getStorage } from '@/infrastructure/storage';
import { logAudit } from '@/modules/audit';
import { prisma } from '@/lib/db/client';

export const GET = asyncHandler(async (
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> => {
  requireRole(req, ['ADMIN', 'STAFF']);
  const service = getDocumentGenerationService();
  const result = await service.getDocumentById(params.id);

  return NextResponse.json({
    success: true,
    data: result,
  } as ApiResponse<typeof result>);
});

export const DELETE = asyncHandler(async (
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> => {
  const session = requireRole(req, ['ADMIN']);

  const document = await prisma.generatedDocument.findUnique({
    where: { id: params.id },
    include: { files: { include: { uploadedFile: true } } },
  });

  if (!document) {
    throw new NotFoundError('GeneratedDocument', params.id);
  }

  // Delete storage files
  const storage = getStorage();
  for (const file of document.files) {
    try {
      await storage.deleteFile(file.uploadedFile.storageKey);
    } catch {
      // File may already be deleted — continue
    }
  }

  // Delete DB record (cascade deletes GeneratedDocumentFile andUploadedFile records)
  await prisma.generatedDocument.delete({ where: { id: params.id } });

  await logAudit({
    actorId: session.sub,
    actorRole: session.role,
    action: 'GENERATED_DOCUMENT_DELETED',
    entityType: 'GeneratedDocument',
    entityId: params.id,
    metadata: { title: document.title, roomNo: document.roomNo },
  });

  return NextResponse.json({
    success: true,
    data: { id: params.id },
    message: 'Document deleted',
  } as ApiResponse<{ id: string }>);
});
