import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/guards';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { createOnlyOfficeDocumentKey, createOnlyOfficeEditorConfig, getOnlyOfficeCallbackBaseUrl, isOnlyOfficeConfigured } from '@/lib/onlyoffice';
import { getOnlyOfficeFileUrl } from '@/lib/onlyoffice/documents';
import { getDocumentTemplateService } from '@/modules/documents/template.service';

export const GET = asyncHandler(async (
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> => {
  const session = requireRole(req, ['ADMIN', 'STAFF']);
  const url = new URL(req.url);
  const versionId = url.searchParams.get('versionId') ?? undefined;
  const createDraft = url.searchParams.get('createDraft') === '1';
  const service = getDocumentTemplateService();

  // Return disabled status when ONLYOFFICE is not configured
  if (!isOnlyOfficeConfigured()) {
    return NextResponse.json({
      success: false,
      configured: false,
      error: {
        message: 'ONLYOFFICE is not configured. Set ONLYOFFICE_ENABLED=false to disable, or configure ONLYOFFICE_DOCUMENT_SERVER_URL and ONLYOFFICE_JWT_SECRET.',
        code: 'ONLYOFFICE_NOT_CONFIGURED',
      },
    } as ApiResponse<never> & { configured: boolean; error: { message: string; code: string } });
  }

  if (createDraft) {
    await service.createDraftVersionFromActive(params.id, session.sub);
  }

  const editorVersion = await service.getEditorVersion(params.id, versionId, session.sub);
  const fileType = editorVersion.version.fileType || 'html';
  const fileUrl = editorVersion.version.storageKey
    ? getOnlyOfficeFileUrl(editorVersion.version.storageKey)
    : getOnlyOfficeFileUrl(editorVersion.version.sourceFile.storageKey);
  const editor = createOnlyOfficeEditorConfig({
    title: editorVersion.version.fileName || `${editorVersion.template.name}.html`,
    url: fileUrl,
    fileType,
    documentType: 'word',
    key: createOnlyOfficeDocumentKey('template-version', editorVersion.version.id, editorVersion.version.updatedAt),
    callbackUrl: `${getOnlyOfficeCallbackBaseUrl()}/api/templates/${params.id}/callback?versionId=${editorVersion.version.id}`,
    user: {
      id: session.sub,
      name: session.displayName,
      group: session.role,
    },
  });

  return NextResponse.json({
    success: true,
    configured: true,
    data: {
      templateId: editorVersion.template.id,
      templateName: editorVersion.template.name,
      versionId: editorVersion.version.id,
      version: editorVersion.version.version,
      documentServerUrl: editor.documentServerUrl,
      config: editor.config,
      token: editor.token,
    },
  } as ApiResponse<{
    templateId: string;
    templateName: string;
    versionId: string;
    version: number;
    documentServerUrl: string;
    config: Record<string, unknown>;
    token?: string;
  }> & { configured: boolean });
});
