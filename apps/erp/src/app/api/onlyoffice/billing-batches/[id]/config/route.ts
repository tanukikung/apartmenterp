import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/guards';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { createOnlyOfficeEditorConfig, getOnlyOfficeCallbackBaseUrl } from '@/lib/onlyoffice';
import { getStoredWorkbookForBatch } from '@/lib/onlyoffice/documents';

export const GET = asyncHandler(async (
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> => {
  const session = requireRole(req, ['ADMIN', 'STAFF']);
  const prepared = await getStoredWorkbookForBatch(params.id);
  const editor = createOnlyOfficeEditorConfig({
    title: prepared.batch.filename,
    url: prepared.documentUrl,
    fileType: prepared.fileType,
    documentType: prepared.documentType,
    key: prepared.key,
    callbackUrl: `${getOnlyOfficeCallbackBaseUrl()}/api/onlyoffice/billing-batches/${prepared.batch.id}/callback`,
    user: {
      id: session.sub,
      name: session.displayName,
      group: session.role,
    },
    // ImportBatch status: PENDING | PROCESSING | COMPLETED | FAILED
    mode: prepared.batch.status === 'COMPLETED' ? 'view' : 'edit',
  });

  return NextResponse.json({
    success: true,
    data: {
      documentServerUrl: editor.documentServerUrl,
      config: editor.config,
      token: editor.token,
    },
  } as ApiResponse<{
    documentServerUrl: string;
    config: Record<string, unknown>;
    token?: string;
  }>);
});
