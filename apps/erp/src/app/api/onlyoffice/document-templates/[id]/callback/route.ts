import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib';
import { asyncHandler } from '@/lib/utils/errors';
import { downloadOnlyOfficeCallbackFile, getOnlyOfficeTemplateStorageKey } from '@/lib/onlyoffice/documents';
import { verifyOnlyOfficeCallbackToken } from '@/lib/onlyoffice';
import { getStorage } from '@/infrastructure/storage';

type OnlyOfficeCallbackBody = {
  status?: number;
  url?: string;
  token?: string;
};

export const POST = asyncHandler(async (
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> => {
  const payload = (await req.json()) as OnlyOfficeCallbackBody;

  if (!verifyOnlyOfficeCallbackToken(req.headers.get('authorization'), payload.token)) {
    return NextResponse.json({ error: 1 });
  }

  const status = Number(payload.status);

  if (![2, 6].includes(status) || !payload.url) {
    return NextResponse.json({ error: 0 });
  }

  const buffer = await downloadOnlyOfficeCallbackFile(payload.url);
  const storage = getStorage();
  const storageKey = getOnlyOfficeTemplateStorageKey(params.id);
  const html = buffer.toString('utf8');

  await storage.uploadFile({
    key: storageKey,
    content: buffer,
    contentType: 'text/html; charset=utf-8',
  });

  await prisma.documentTemplate.update({
    where: { id: params.id },
    data: {
      body: html,
    },
  });

  return NextResponse.json({ error: 0 });
});
