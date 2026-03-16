import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/guards';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { getDocumentGenerationService } from '@/modules/documents/generation.service';
import { documentGenerateSchema } from '@/modules/documents/types';

export const POST = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  const session = requireRole(req, ['ADMIN', 'STAFF']);
  const body = documentGenerateSchema.parse(await req.json());
  const service = getDocumentGenerationService();

  if (body.dryRun) {
    const result = await service.previewGeneration(body, session.sub);
    return NextResponse.json({
      success: true,
      data: result,
    } as ApiResponse<typeof result>);
  }

  const result = await service.generateDocuments(body, session.sub);
  return NextResponse.json({
    success: true,
    data: result,
  } as ApiResponse<typeof result>, { status: 201 });
});
