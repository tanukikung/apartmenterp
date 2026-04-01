import { NextRequest, NextResponse } from 'next/server';
import { requireAuthSession, requireRole } from '@/lib/auth/guards';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { getDocumentTemplateService } from '@/modules/documents/template.service';
import { createTemplateSchema, templateListQuerySchema } from '@/modules/documents/types';

export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  requireAuthSession(req);
  const url = new URL(req.url);
  const query = templateListQuerySchema.parse({
    type: url.searchParams.get('type') ?? undefined,
    status: url.searchParams.get('status') ?? undefined,
    pageSize: url.searchParams.get('pageSize') ?? undefined,
  });

  const service = getDocumentTemplateService();
  const result = await service.listTemplates(query);

  return NextResponse.json({
    success: true,
    data: result,
  } as ApiResponse<typeof result>);
});

export const POST = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  const session = requireRole(req, ['ADMIN', 'STAFF']);
  const body = createTemplateSchema.parse(await req.json());
  const service = getDocumentTemplateService();
  const result = await service.createTemplate(body, session.sub);

  return NextResponse.json({
    success: true,
    data: result,
  } as ApiResponse<typeof result>, { status: 201 });
});
