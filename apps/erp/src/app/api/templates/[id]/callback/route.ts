import { NextRequest, NextResponse } from 'next/server';
import { asyncHandler } from '@/lib/utils/errors';
import { downloadOnlyOfficeCallbackFile } from '@/lib/onlyoffice/documents';
import { getDocumentTemplateService } from '@/modules/documents/template.service';

type OnlyOfficeCallbackBody = {
  status?: number;
  url?: string;
};

export const POST = asyncHandler(async (
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> => {
  const payload = (await req.json()) as OnlyOfficeCallbackBody;
  const status = Number(payload.status);
  const versionId = new URL(req.url).searchParams.get('versionId');

  if (![2, 6].includes(status) || !payload.url || !versionId) {
    return NextResponse.json({ error: 0 });
  }

  const buffer = await downloadOnlyOfficeCallbackFile(payload.url);
  const html = buffer.toString('utf8');
  const service = getDocumentTemplateService();
  await service.saveOnlyOfficeVersionBody(params.id, versionId, html);

  return NextResponse.json({ error: 0 });
});
