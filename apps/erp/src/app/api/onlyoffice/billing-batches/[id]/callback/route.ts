import { NextRequest, NextResponse } from 'next/server';
import { asyncHandler } from '@/lib/utils/errors';
import { verifyOnlyOfficeCallbackToken } from '@/lib/onlyoffice';

type OnlyOfficeCallbackBody = {
  status?: number;
  url?: string;
  token?: string;
};

// TODO: Rewrite for new ImportBatch schema. BillingImportBatch model has been removed.
export const POST = asyncHandler(async (
  req: NextRequest,
  { params: _params }: { params: { id: string } },
): Promise<NextResponse> => {
  const payload = (await req.json()) as OnlyOfficeCallbackBody;

  if (!verifyOnlyOfficeCallbackToken(req.headers.get('authorization'), payload.token)) {
    return NextResponse.json({ error: 1 });
  }

  // TODO: implement with ImportBatch model
  return NextResponse.json({ error: 0 });
});
