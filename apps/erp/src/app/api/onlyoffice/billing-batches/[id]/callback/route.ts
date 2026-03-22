import { NextRequest, NextResponse } from 'next/server';
import { asyncHandler } from '@/lib/utils/errors';
import { verifyOnlyOfficeCallbackToken } from '@/lib/onlyoffice';
import { prisma } from '@/lib/db/client';

type OnlyOfficeCallbackBody = {
  status?: number;
  url?: string;
  token?: string;
};

export const POST = asyncHandler(async (
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> => {
  const { id } = params;
  const payload = (await req.json()) as OnlyOfficeCallbackBody;

  if (!verifyOnlyOfficeCallbackToken(req.headers.get('authorization'), payload.token)) {
    return NextResponse.json({ error: 1 });
  }

  // Find the import batch
  const batch = await prisma.importBatch.findUnique({ where: { id } });
  if (!batch) {
    return NextResponse.json({ error: 1 });
  }

  // Only process if batch is still PENDING
  if (batch.status !== 'PENDING') {
    return NextResponse.json({ error: 0 });
  }

  // status: 0 = successfully saved, 1 = error
  if (payload.status === 1) {
    await prisma.importBatch.update({
      where: { id },
      data: {
        status: 'FAILED',
        errorLog: { message: 'OnlyOffice editing failed', url: payload.url },
      },
    });
    return NextResponse.json({ error: 0 });
  }

  // Successfully saved in OnlyOffice - mark as PROCESSING so user can review and execute
  await prisma.importBatch.update({
    where: { id },
    data: { status: 'PROCESSING' },
  });

  return NextResponse.json({ error: 0 });
});
