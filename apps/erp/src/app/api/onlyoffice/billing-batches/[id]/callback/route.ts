import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib';
import { asyncHandler } from '@/lib/utils/errors';
import { downloadOnlyOfficeCallbackFile } from '@/lib/onlyoffice/documents';
import { getStorage } from '@/infrastructure/storage';
import { rebuildBillingImportBatchFromWorkbook } from '@/modules/billing/import-batch.service';

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

  if (![2, 6].includes(status) || !payload.url) {
    return NextResponse.json({ error: 0 });
  }

  const batch = await prisma.billingImportBatch.findUnique({
    where: { id: params.id },
    include: { uploadedFile: true },
  });
  if (!batch?.uploadedFile) {
    return NextResponse.json({ error: 1 });
  }

  const buffer = await downloadOnlyOfficeCallbackFile(payload.url);
  const storage = getStorage();
  await storage.uploadFile({
    key: batch.uploadedFile.storageKey,
    content: buffer,
    contentType: batch.uploadedFile.mimeType,
  });

  await rebuildBillingImportBatchFromWorkbook({
    batchId: batch.id,
    filename: batch.sourceFilename,
    fileBuffer: new Uint8Array(buffer),
    uploadedFileId: batch.uploadedFileId,
  });

  return NextResponse.json({ error: 0 });
});
